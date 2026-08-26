import { create } from 'zustand'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import { useAgencyStore } from '@/state/agencyStore'
import { useGameStore } from '@/state/gameStore'
import { useStoryStore } from '@/state/storyStore'
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
import { rivalEtaSec, applyRaceResult } from '@/lib/rival'
import { refuelPricePerDv, SATELLITE_PRICE } from '@/lib/economy'
import { isAgencyStuck } from '@/lib/recovery'
import { fleetReachability } from '@/lib/reachability'

const KEY = 'hyperion-contracts-v1'

// ─── Deterministic helpers ───────────────────────────────────────────────────

/** Fast deterministic hash over a string (same algorithm as rival.ts). */
function hashStr(s: string): number {
  let h = 17
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff
  }
  return h
}

/**
 * Deterministically decide whether a contract should be contested by the rival.
 * ~1-in-4 contracts are contested (hash mod 4 === 0). Never place contracts are
 * contested (those are player-initiated and feel different from the rival race narrative).
 */
function shouldContest(contractId: string, kind: string): boolean {
  if (kind === 'place') return false
  return hashStr(contractId) % 4 === 0
}

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
  /**
   * Transient fleet-reachability annotation — computed when building/refreshing
   * available contracts and on fleet change. Not persisted (recomputed each session).
   */
  reach?: import('@/lib/reachability').FleetReach
  /**
   * If set, this contract is contested — the rival has an ETA and whoever
   * reaches the target first wins. rivalEtaSec is measured from acceptedAtSec
   * (sim-time when the player accepted). If rivalEtaSec is elapsed before the
   * player completes, the rival claims it.
   */
  contested?: {
    /** Rival ETA in sim-seconds measured from acceptedAtSec. */
    rivalEtaSec: number
    /** Sim-time when the player accepted this contract. */
    acceptedAtSec: number
  }
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
  /**
   * Voluntarily abandon an ACTIVE contract (stand down).
   * Sets the contract to 'failed', frees the committed satellite (clears targetId if it
   * pointed at this contract), emits a dispatch, and applies a reputation ding
   * (waived if the agency is stuck: funds === 0 and all sats have little fuel).
   * Returns false if the contract is not found or not active.
   */
  standDown(id: string): boolean
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
    const now = simNow()
    if (c.deadline < now) return false
    const activeCount = s.contracts.filter((x) => x.status === 'active').length
    if (activeCount >= maxActiveContracts(useAgencyStore.getState().reputation)) return false

    // Determine if this contract is contested (deterministic, ~1-in-4, non-place).
    // Compute rival ETA relative to the deadline window from acceptance time.
    const deadlineWindow = c.deadline - now
    const difficulty = c.reward.reputation / 30 // proxy: higher-rep contracts are harder
    const contested: Contract['contested'] = shouldContest(c.id, c.kind)
      ? { rivalEtaSec: rivalEtaSec(c.id, deadlineWindow, difficulty), acceptedAtSec: now }
      : undefined

    set((st) => ({
      contracts: st.contracts.map((x) =>
        x.id === id
          ? {
              ...x,
              status: 'active' as const,
              progress: x.gameObjective ? freshProgress() : undefined,
              ...(contested !== undefined ? { contested } : {}),
            }
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

      // ── Rival claim check (before player completion) ──────────────────────
      // For a contested contract, check if the rival's ETA has elapsed before
      // the player completed this tick. If so, the rival claims it (soft-fail).
      if (c.contested && !contractReadyToComplete) {
        const elapsed = simTime - c.contested.acceptedAtSec
        if (elapsed >= c.contested.rivalEtaSec) {
          // Rival claimed it — soft-fail with no (or minimal) rep ding.
          const storyStore = useStoryStore.getState()
          const rival = storyStore.rival
          const updatedRival = applyRaceResult(rival, 'rival')
          storyStore.setRival(updatedRival)
          storyStore.addDispatch({
            id: `rival-claim-${c.id}`,
            at: Date.now(),
            text: `${rival.name} reached ${c.title} first. Contract reassigned.`,
            source: 'rival',
          })
          // Soft-fail: a small -1 rep note, not the usual -5 expiry penalty.
          agency.addReputation(-1)
          const bad = { ...c, status: 'failed' as const }
          failed.push(bad)
          return bad
        }
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
        // Sanity-capped at §1500 so no single contract ever produces absurd windfalls
        // (theoretical max without cap: §500 × 1.35 × 1.5 × 1.8 = §1822).
        funding = Math.min(1500, Math.round(funding * multiplier * objScale))
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

        // ── Rival race outcome (player won) ──────────────────────────────────
        if (c.contested) {
          const storyStore = useStoryStore.getState()
          const rival = storyStore.rival
          const updatedRival = applyRaceResult(rival, 'player')
          storyStore.setRival(updatedRival)
          // Small rep bonus for beating the rival.
          agency.addReputation(2)
          storyStore.addDispatch({
            id: `rival-beat-${c.id}`,
            at: Date.now(),
            text: `You beat ${rival.name} to ${c.title}. They won't forget that.`,
            source: 'rival',
          })
        }

        // ── Milestone accrual (SEPARATE from the single contract award above) ──
        // Called on every completion; only grants funding/token on 5th, 10th, … tier.
        {
          const { grantedFunding, grantedTokens } = useAgencyStore.getState().recordCompletionMilestone()
          if (grantedFunding > 0 || grantedTokens > 0) {
            const storyStore = useStoryStore.getState()
            if (grantedFunding > 0) {
              storyStore.addDispatch({
                id: `relief-grant-${c.id}-${Date.now()}`,
                at: Date.now(),
                text: `Relief grant secured: §${grantedFunding}`,
                source: 'story',
              })
            }
            if (grantedTokens > 0) {
              storyStore.addDispatch({
                id: `refit-token-${c.id}-${Date.now()}`,
                at: Date.now(),
                text: `Emergency-refit token earned.`,
                source: 'story',
              })
            }
          }
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

    // ── Stuck backstop (hard floor) ─────────────────────────────────────────
    // If the agency is completely stuck AND out of funds AND has no refit
    // tokens AND the backstop hasn't already fired this episode, grant a
    // minimal emergency relief drop so the game can always continue.
    const agencyNow = useAgencyStore.getState()
    if (
      agencyNow.funding === 0 &&
      agencyNow.milestones.refitTokens === 0 &&
      !agencyNow.reliefEmergencyUsed
    ) {
      const fleet = useGameStore.getState().satellites
      const activeContracts = bounded.filter((c) => c.status === 'active')
      if (activeContracts.length > 0) {
        // Compute bestApproxDvMs per active contract (from fleetReachability).
        const activeTargetsBestDv = activeContracts.map((c) => {
          const reach = fleetReachability(fleet, { lat: c.lat, lon: c.lon })
          return reach.reachable ? reach.bestApproxDvMs : null
        })
        const pricePerDv = refuelPricePerDv(agencyNow.refuelEfficiencyLevel ?? 0)
        const stuck = isAgencyStuck({
          fleet,
          funds: agencyNow.funding,
          activeTargetsBestDv,
          satellitePrice: SATELLITE_PRICE,
          pricePerDv,
        })
        if (stuck) {
          const EMERGENCY_AMOUNT = 150
          agencyNow.grantEmergencyRelief(EMERGENCY_AMOUNT)
          useStoryStore.getState().addDispatch({
            id: `emergency-relief-drop-${Date.now()}`,
            at: Date.now(),
            text: `Emergency relief drop authorised — §${EMERGENCY_AMOUNT} to keep operations alive.`,
            source: 'story',
          })
        }
      }
    }

    return { completed, failed }
  },

  standDown: (id) => {
    const s = get()
    const c = s.contracts.find((x) => x.id === id)
    if (!c || c.status !== 'active') return false

    // Mark contract as failed (soft — keeps history consistent).
    const updated = s.contracts.map((x) =>
      x.id === id ? { ...x, status: 'failed' as const } : x,
    )
    // Free the committed satellite by clearing targetId if it pointed here.
    const nextTargetId = s.targetId === id ? null : s.targetId

    // Determine if we should waive the reputation penalty.
    // Approximation: agency is "stuck" if funds are 0 (can't refuel or buy a new sat)
    // AND no satellite has meaningful fuel to fly anything useful.
    // This intentionally doesn't require any active contracts to be present —
    // it reflects the player's overall resource state at stand-down time.
    const fleet = useGameStore.getState().satellites
    const funds = useAgencyStore.getState().funding
    const pricePerDv = refuelPricePerDv(useAgencyStore.getState().refuelEfficiencyLevel ?? 0)
    const maxFuel = fleet.reduce((best, sat) => Math.max(best, sat.fuel), 0)
    // "Near-empty" heuristic: max fuel is less than 50 m/s (can't reach anything useful).
    const fleetDry = maxFuel < 50
    // Can't buy a new satellite or afford any refuel at all.
    const cantAffordAnything = funds < Math.ceil(1 * pricePerDv) && funds < SATELLITE_PRICE
    const stuck = fleetDry && cantAffordAnything

    if (!stuck) {
      useAgencyStore.getState().addReputation(-2)
    }

    // Emit a stand-down dispatch.
    useStoryStore.getState().addDispatch({
      id: `standdown-${id}-${Date.now()}`,
      at: Date.now(),
      text: `Stood down from ${c.title}.`,
      source: 'story',
    })

    set({ contracts: updated, targetId: nextTargetId })
    save(get)
    return true
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

// Expose the store on window in non-production so Playwright e2e tests can
// inspect contracts and seed state without relying on the briefing AI route.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  ;(window as unknown as Record<string, unknown>).__contractStore = useContractStore
}
