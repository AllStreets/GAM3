import { create } from 'zustand'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import { useAgencyStore } from '@/state/agencyStore'
import { maxActiveContracts } from '@/lib/economy'
import { groundDistanceKm, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import type { Satellite } from '@/state/gameStore'

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
  resetForTest(): void
}

function save(get: () => ContractState) {
  const s = get()
  saveJSON(KEY, { contracts: s.contracts, targetId: s.targetId })
}

export const useContractStore = create<ContractState>((set, get) => ({
  ...loadJSON<Persisted>(KEY, DEFAULTS),

  setAvailable: (next) => {
    const existing = new Set(get().contracts.map((c) => c.id))
    const fresh = next.filter((c) => !existing.has(c.id)).map((c) => ({ ...c, status: 'available' as const }))
    if (fresh.length === 0) return
    set((s) => ({ contracts: [...s.contracts, ...fresh] }))
    save(get)
  },

  accept: (id) => {
    const s = get()
    const c = s.contracts.find((x) => x.id === id)
    if (!c || c.status !== 'available') return false
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

    const contracts = get().contracts.map((c) => {
      if (c.status !== 'active') return c
      // Completion: any satellite's sub-point within the imaging radius right now.
      const hit = satellites.some(
        (sat) => groundDistanceKm(sat.elements, simTime, { lat: c.lat, lon: c.lon }) <= COMPLETION_RADIUS_KM,
      )
      if (hit) {
        agency.addFunding(c.reward.funding)
        agency.addReputation(c.reward.reputation)
        const done = { ...c, status: 'completed' as const }
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

    if (completed.length || failed.length) {
      set({ contracts })
      save(get)
    }
    return { completed, failed }
  },

  resetForTest: () => {
    clearKey(KEY)
    set({ ...DEFAULTS })
  },
}))
