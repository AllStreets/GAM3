import { create } from 'zustand'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import { STARTING_FUNDING, STARTING_REPUTATION } from '@/lib/economy'

const KEY = 'hyperion-agency-v1'

interface Persisted {
  founded: boolean
  name: string
  emblemId: string
  colorway: string
  funding: number
  reputation: number
}

const DEFAULTS: Persisted = {
  founded: false,
  name: '',
  emblemId: 'crest-rings',
  colorway: '#45d8ff',
  funding: STARTING_FUNDING,
  reputation: STARTING_REPUTATION,
}

interface AgencyState extends Persisted {
  found(name: string, emblemId: string, colorway: string): void
  addFunding(n: number): void
  spendFunding(n: number): boolean
  addReputation(n: number): void
  resetForTest(): void
}

function persistOf(s: AgencyState): Persisted {
  return {
    founded: s.founded, name: s.name, emblemId: s.emblemId,
    colorway: s.colorway, funding: s.funding, reputation: s.reputation,
  }
}

export const useAgencyStore = create<AgencyState>((set, get) => ({
  ...loadJSON<Persisted>(KEY, DEFAULTS),

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

  resetForTest: () => {
    clearKey(KEY)
    set({ ...DEFAULTS })
  },
}))
