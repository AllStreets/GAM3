import { create } from 'zustand'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import { STARTING_FUNDING, STARTING_REPUTATION } from '@/lib/economy'
import {
  Archetype,
  Leaning,
  ZERO_LEANING,
  advanceLeaning,
  dominantArchetype,
  archetypeTitle,
} from '@/lib/archetype'

const KEY = 'hyperion-agency-v1'

interface Persisted {
  founded: boolean
  name: string
  emblemId: string
  colorway: string
  funding: number
  reputation: number
  leaning: Leaning
}

const DEFAULTS: Persisted = {
  founded: false,
  name: '',
  emblemId: 'crest-rings',
  colorway: '#45d8ff',
  funding: STARTING_FUNDING,
  reputation: STARTING_REPUTATION,
  leaning: ZERO_LEANING,
}

interface AgencyState extends Persisted {
  /**
   * Refuel efficiency upgrade level (0 = base, increased by Plan T4).
   * Stored here as a transient optional so gameStore / contractStore can read it
   * without TS errors; T4 will wire it into Persisted and DEFAULTS.
   */
  refuelEfficiencyLevel?: number
  found(name: string, emblemId: string, colorway: string): void
  addFunding(n: number): void
  spendFunding(n: number): boolean
  addReputation(n: number): void
  advanceArchetype(tag: Archetype, weight?: number): void
  hydrate(): void
  resetForTest(): void
}

function persistOf(s: AgencyState): Persisted {
  return {
    founded: s.founded, name: s.name, emblemId: s.emblemId,
    colorway: s.colorway, funding: s.funding, reputation: s.reputation,
    leaning: s.leaning,
  }
}

export const useAgencyStore = create<AgencyState>((set, get) => ({
  ...DEFAULTS,

  found: (name, emblemId, colorway) => {
    set({ founded: true, name: name.trim() || 'Unnamed Agency', emblemId, colorway })
    saveJSON(KEY, persistOf(get()))
  },

  addFunding: (n) => {
    set((s) => ({ funding: s.funding + n }))
    saveJSON(KEY, persistOf(get()))
  },

  spendFunding: (n) => {
    if (n > get().funding) return false
    set((s) => ({ funding: s.funding - n }))
    saveJSON(KEY, persistOf(get()))
    return true
  },

  addReputation: (n) => {
    set((s) => ({ reputation: Math.max(0, s.reputation + n) }))
    saveJSON(KEY, persistOf(get()))
  },

  advanceArchetype: (tag, weight?) => {
    set((s) => ({ leaning: advanceLeaning(s.leaning, tag, weight) }))
    saveJSON(KEY, persistOf(get()))
  },

  hydrate: () => {
    const saved = loadJSON<Persisted>(KEY, DEFAULTS)
    set({ ...saved, leaning: saved.leaning ?? ZERO_LEANING })
  },

  resetForTest: () => {
    clearKey(KEY)
    set({ ...DEFAULTS })
  },
}))

export function agencyTitle(): string {
  const s = useAgencyStore.getState()
  return archetypeTitle(dominantArchetype(s.leaning), s.reputation)
}

export function agencyArchetype(): Archetype | null {
  const s = useAgencyStore.getState()
  return dominantArchetype(s.leaning)
}
