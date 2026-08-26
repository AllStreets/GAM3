import { create } from 'zustand'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import { useAgencyStore } from '@/state/agencyStore'
import { useGameStore } from '@/state/gameStore'
import { maxActiveContracts } from '@/lib/economy'
import { groundDistanceKm, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import { simNow } from '@/lib/simTime'
import type { Satellite } from '@/state/gameStore'
import type { Archetype } from '@/lib/archetype'
import type { Capability } from '@/lib/satelliteMeta'
import { simDaysInOrbit } from '@/lib/satelliteMeta'
import { archetypeForKind, capabilityForKind, matchBonusFunding } from '@/lib/contractMeta'
import { reliefImpactLine } from '@/lib/reliefImpact'
import {
  freshProgress,
  evaluateObjective,
  objectiveRewardScale,
  type Objective,
  type ObjectiveProgress,
} from '@/lib/contractObjective'

const KEY = 'hyperion-contracts-v1'

export type ContractStatus = 'available' | 'active' | 'completed' | 'failed'

export interface CompletionEvent {
  contractId: string
  title: string
  lat: number
  lon: number
  funding: number
  reputation: number
  matched: boolean
  archetype: Archetype
  completedBy: string
  streak: number
  multiplier: number
  grade?: 'S' | 'A' | 'B' | 'C'
  trickShot?: number
  /** Left undefined here; T6 will populate for relief contracts. */
  reliefImpact?: string
}

export interface Contract {
  id: string
  eventId: string
  title: string
  /** Optional narrative objective written by AI or fallback; shown in ContractsPanel. */
  objective?: string
  /** Structured gameplay objective (multi-pass / multi-sat / dwell / single-pass). */
  gameObjective?: Objective
  /** Live progress for gameObjective — stored on contract, reset on accept. */
  progress?: ObjectiveProgress
  kind: string
  lat: number
  lon: number
  /** sim-time seconds */
  deadline: number
  reward: { funding: number; reputation: number }
  status: ContractStatus
  archetype: Archetype
  preferredCapability: Capability
  /** Transient — populated on completion, not persisted. */
  completedBy?: string
  matched?: boolean
}

interface Persisted {
  contracts: Contract[]
  targetId: string | null
}

const DEFAULTS: Persisted = { contracts: [], targetId: null }

/** Sim-time of the previous evaluate() call, for computing dwell/multi-pass dt. Reset in resetForTest. */
let lastEvalSimTime = -1e9

interface ContractState extends Persisted {
  /** Transient — set on completion, cleared by the overlay after display. Not persisted. */
  lastCompletion: CompletionEvent | null
  setAvailable(next: Contract[]): void
  addContract(c: Contract): void
  accept(id: string): boolean
  setTarget(id: string | null): void
  evaluate(satellites: Satellite[], simTime: number): { completed: Contract[]; failed: Contract[] }
  clearCompletion(): void
  hydrate(): void
  resetForTest(): void
}

function save(get: () => ContractState) {
  const s = get()
  saveJSON(KEY, { contracts: s.contracts, targetId: s.targetId })
}

export const useContractStore = create<ContractState>((set, get) => ({
  ...DEFAULTS,
  lastCompletion: null,

  setAvailable: (next) => {
    const existingMap = new Map(get().contracts.map((c) => [c.id, c]))
    const fresh: Contract[] = []
    let changed = false
    for (const incoming of next) {
      const existing = existingMap.get(incoming.id)
      if (!existing) {
        fresh.push({ ...incoming, status: 'available' as const })
      } else if (existing.status === 'available') {
        // Refresh deadline and reward for re-offered available contracts.
        existingMap.set(incoming.id, { ...existing, deadline: incoming.deadline, reward: incoming.reward })
        changed = true
      }
      // active/completed/failed: leave untouched
    }
    if (fresh.length === 0 && !changed) return
    const updated = Array.from(existingMap.values())
    set({ contracts: [...updated, ...fresh] })
    save(get)
  },

  addContract: (c) => {
    const existing = get().contracts
    if (existing.some((x) => x.id === c.id)) return
    set({ contracts: [...existing, { ...c, status: 'available' as const }] })
    save(get)
  },

  accept: (id) => {
    const s = get()
    const c = s.contracts.find((x) => x.id === id)
    if (!c || c.status !== 'available') return false
    if (c.deadline < simNow()) return false
    const activeCount = s.contracts.filter((x) => x.status === 'active').length
    if (activeCount >= maxActiveContracts(useAgencyStore.getState().reputation)) return false
    set((st) => ({
      contracts: st.contracts.map((x) =>
        x.id === id
          ? { ...x, status: 'active' as const, progress: x.gameObjective ? freshProgress() : undefined }
          : x,
      ),
      targetId: id,
    }))
    save(get)
    return true
  },

  setTarget: (id) => {
    set({ targetId: id })
    save(get)
  },

  evaluate: (satellites, simTime) => {
    const completed: Contract[] = []
    const failed: Contract[] = []
    const agency = useAgencyStore.getState()

    // Drop stale available contracts (expired offers — no reputation ding).
    const afterExpiry = get().contracts.filter(
      (c) => !(c.status === 'available' && c.deadline < simTime),
    )
    const staleDropped = afterExpiry.length !== get().contracts.length

    let pendingCompletion: CompletionEvent | null = null
    let progressChanged = false

    // Sim-seconds elapsed since the previous evaluate — used for dwell/multi-pass dt.
    // Computed from the actual sim-time delta so it stays correct regardless of the
    // engine's throttle cadence (ContractLayer fires ~every 10 sim-sec) or TIME_SCALE.
    // First call / gaps / non-advancing time fall back to a nominal 10 sim-sec.
    const rawDt = simTime - lastEvalSimTime
    const DT_SEC = lastEvalSimTime < 0 || rawDt <= 0 || rawDt > 120 ? 10 : rawDt
    lastEvalSimTime = simTime

    const contracts = afterExpiry.map((c) => {
      if (c.status !== 'active') return c

      // Compute which satellites are within the imaging radius this tick.
      const inRangeSatIds = satellites
        .filter((sat) => groundDistanceKm(sat.elements, simTime, { lat: c.lat, lon: c.lon }) <= COMPLETION_RADIUS_KM)
        .map((sat) => sat.id)

      // --- Objective-aware completion logic ---
      let contractReadyToComplete = false
      let updatedProgress: ObjectiveProgress | undefined = c.progress

      if (c.gameObjective) {
        // Advance objective progress this tick.
        const prevProgress = c.progress ?? freshProgress()
        updatedProgress = evaluateObjective(c.gameObjective, prevProgress, {
          inRangeSatIds,
          dtSec: DT_SEC,
        })
        contractReadyToComplete = updatedProgress.done
      } else {
        // Back-compat: no gameObjective → original single-pass behaviour.
        contractReadyToComplete = inRangeSatIds.length > 0
      }

      // If progress changed but objective not yet done, save the updated progress.
      if (c.gameObjective && !contractReadyToComplete) {
        progressChanged = true
        return { ...c, progress: updatedProgress }
      }

      if (contractReadyToComplete) {
        // Use the first in-range sat (or any matching sat) to attribute the completion.
        const completingSat =
          satellites.find(
            (sat) => inRangeSatIds.includes(sat.id) && sat.capability === c.preferredCapability,
          ) ?? satellites.find((sat) => inRangeSatIds.includes(sat.id))

        // If progress.done fired but no sat currently in range (e.g. multi-sat finished
        // a prior tick), fall back gracefully.
        if (!completingSat) {
          return c.gameObjective ? { ...c, progress: updatedProgress } : c
        }

        const matched = completingSat.capability === c.preferredCapability
        // Base funding: capability bonus layer.
        let funding = matchBonusFunding(c.reward.funding, matched)
        // Streak multiplier.
        useGameStore.getState().bumpStreak()
        const streak = useGameStore.getState().streak
        const multiplier = 1 + Math.min(0.5, 0.1 * (streak - 1))
        // Objective scale layer.
        const objScale = c.gameObjective ? objectiveRewardScale(c.gameObjective) : 1.0
        // Single award site: base × capabilityBonus × streakMult × objectiveScale.
        funding = Math.round(funding * multiplier * objScale)
        agency.addFunding(funding)
        agency.addReputation(c.reward.reputation)
        useAgencyStore.getState().advanceArchetype(c.archetype)
        // Pull last maneuver/trick-shot from gameStore for the cinematic event.
        const gs = useGameStore.getState()
        const grade = gs.lastManeuver?.grade ?? undefined
        const trickShot = gs.lastTrickShot?.count ?? undefined
        // Persist trick-shot note to the completing satellite's service record.
        if (trickShot != null) {
          const sat = gs.satellites.find((s) => s.id === completingSat.id)
          const days = sat ? simDaysInOrbit(sat.record.commissionedAt, simTime) : 0
          useGameStore.getState().recordContractPass(completingSat.id, `Trick-shot ×${trickShot} · SD ${days}`)
        } else {
          useGameStore.getState().recordContractPass(completingSat.id)
        }
        // Last completion wins if multiple contracts complete in one eval tick.
        pendingCompletion = {
          contractId: c.id,
          title: c.title,
          lat: c.lat,
          lon: c.lon,
          funding,
          reputation: c.reward.reputation,
          matched,
          archetype: c.archetype,
          completedBy: completingSat.id,
          streak,
          multiplier,
          grade,
          trickShot,
          ...(c.archetype === 'relief' ? { reliefImpact: reliefImpactLine(c.kind, c.title) } : {}),
        }
        const done = { ...c, status: 'completed' as const, completedBy: completingSat.id, matched, progress: updatedProgress }
        completed.push(done)
        return done
      }

      if (simTime > c.deadline) {
        agency.addReputation(-5)
        useGameStore.getState().resetStreak()
        const bad = { ...c, status: 'failed' as const }
        failed.push(bad)
        return bad
      }
      return c.gameObjective ? { ...c, progress: updatedProgress } : c
    })

    // Cap completed+failed history to most recent 10.
    const nonHistory = contracts.filter((c) => c.status === 'available' || c.status === 'active')
    const history = contracts.filter((c) => c.status === 'completed' || c.status === 'failed').slice(-10)
    const bounded = [...nonHistory, ...history]

    // Consume maneuver grade/trick-shot once per tick, after all completions have read them.
    if (pendingCompletion) {
      useGameStore.getState().clearLastManeuver()
    }

    if (completed.length || failed.length || staleDropped || progressChanged) {
      set({ contracts: bounded, ...(pendingCompletion ? { lastCompletion: pendingCompletion } : {}) })
      save(get)
    }
    return { completed, failed }
  },

  clearCompletion: () => set({ lastCompletion: null }),

  hydrate: () => {
    const data = loadJSON<Persisted>(KEY, DEFAULTS)
    const backfilled = {
      ...data,
      contracts: data.contracts.map((c) => ({
        ...c,
        archetype: c.archetype ?? archetypeForKind(c.kind),
        preferredCapability: c.preferredCapability ?? capabilityForKind(c.kind),
      })),
    }
    set(backfilled)
  },

  resetForTest: () => {
    clearKey(KEY)
    lastEvalSimTime = -1e9
    set({ ...DEFAULTS, lastCompletion: null })
  },
}))
