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
import { archetypeForKind, capabilityForKind, matchBonusFunding } from '@/lib/contractMeta'

const KEY = 'hyperion-contracts-v1'

export type ContractStatus = 'available' | 'active' | 'completed' | 'failed'

export interface Contract {
  id: string
  eventId: string
  title: string
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

interface ContractState extends Persisted {
  setAvailable(next: Contract[]): void
  accept(id: string): boolean
  setTarget(id: string | null): void
  evaluate(satellites: Satellite[], simTime: number): { completed: Contract[]; failed: Contract[] }
  hydrate(): void
  resetForTest(): void
}

function save(get: () => ContractState) {
  const s = get()
  saveJSON(KEY, { contracts: s.contracts, targetId: s.targetId })
}

export const useContractStore = create<ContractState>((set, get) => ({
  ...DEFAULTS,

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

  accept: (id) => {
    const s = get()
    const c = s.contracts.find((x) => x.id === id)
    if (!c || c.status !== 'available') return false
    if (c.deadline < simNow()) return false
    const activeCount = s.contracts.filter((x) => x.status === 'active').length
    if (activeCount >= maxActiveContracts(useAgencyStore.getState().reputation)) return false
    set((st) => ({
      contracts: st.contracts.map((x) => (x.id === id ? { ...x, status: 'active' as const } : x)),
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

    const contracts = afterExpiry.map((c) => {
      if (c.status !== 'active') return c
      // Completion: any satellite's sub-point within the imaging radius right now.
      const completingSat = satellites.find(
        (sat) => groundDistanceKm(sat.elements, simTime, { lat: c.lat, lon: c.lon }) <= COMPLETION_RADIUS_KM,
      )
      if (completingSat) {
        const matched = completingSat.capability === c.preferredCapability
        let funding = matchBonusFunding(c.reward.funding, matched)
        agency.addFunding(funding)
        agency.addReputation(c.reward.reputation)
        useGameStore.getState().recordContractPass(completingSat.id)
        useAgencyStore.getState().advanceArchetype(c.archetype)
        const done = { ...c, status: 'completed' as const, completedBy: completingSat.id, matched }
        completed.push(done)
        return done
      }
      if (simTime > c.deadline) {
        agency.addReputation(-5)
        const bad = { ...c, status: 'failed' as const }
        failed.push(bad)
        return bad
      }
      return c
    })

    // Cap completed+failed history to most recent 10.
    const nonHistory = contracts.filter((c) => c.status === 'available' || c.status === 'active')
    const history = contracts.filter((c) => c.status === 'completed' || c.status === 'failed').slice(-10)
    const bounded = [...nonHistory, ...history]

    if (completed.length || failed.length || staleDropped) {
      set({ contracts: bounded })
      save(get)
    }
    return { completed, failed }
  },

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
    set({ ...DEFAULTS })
  },
}))
