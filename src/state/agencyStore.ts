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
import {
  type Milestones,
  freshMilestones,
  accrueOnCompletion,
} from '@/lib/milestones'

export type { Milestones }

const KEY = 'hyperion-agency-v1'

interface Persisted {
  founded: boolean
  name: string
  emblemId: string
  colorway: string
  funding: number
  reputation: number
  leaning: Leaning
  milestones: Milestones
  /** Guards the stuck-backstop from firing repeatedly in one stuck episode. */
  reliefEmergencyUsed: boolean
}

const DEFAULTS: Persisted = {
  founded: false,
  name: '',
  emblemId: 'crest-rings',
  colorway: '#45d8ff',
  funding: STARTING_FUNDING,
  reputation: STARTING_REPUTATION,
  leaning: ZERO_LEANING,
  milestones: freshMilestones(),
  reliefEmergencyUsed: false,
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
  /**
   * Called by contractStore on every COMPLETION. Applies accrueOnCompletion,
   * adds any granted funding (a SEPARATE path from the single contract award),
   * and grants refit tokens. Resets reliefEmergencyUsed (agency is no longer stuck).
   * Returns the granted amounts so the caller can emit dispatches.
   */
  recordCompletionMilestone(): { grantedFunding: number; grantedTokens: number }
  /**
   * Spend one refit token. Returns true if a token was available, false otherwise.
   */
  spendRefitToken(): boolean
  /**
   * Emergency-relief drop (stuck backstop). Calls addFunding internally.
   */
  grantEmergencyRelief(amount: number): void
  hydrate(): void
  resetForTest(): void
}

function persistOf(s: AgencyState): Persisted {
  return {
    founded: s.founded, name: s.name, emblemId: s.emblemId,
    colorway: s.colorway, funding: s.funding, reputation: s.reputation,
    leaning: s.leaning,
    milestones: s.milestones,
    reliefEmergencyUsed: s.reliefEmergencyUsed,
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

  recordCompletionMilestone: () => {
    const current = get().milestones
    const { milestones: next, grantedFunding, grantedTokens } = accrueOnCompletion(current)
    // Apply milestone grant funding (SEPARATE path from the single contract award).
    const newFunding = get().funding + grantedFunding
    set({ milestones: next, funding: newFunding, reliefEmergencyUsed: false })
    saveJSON(KEY, persistOf(get()))
    return { grantedFunding, grantedTokens }
  },

  spendRefitToken: () => {
    const tokens = get().milestones.refitTokens
    if (tokens <= 0) return false
    const next: Milestones = { ...get().milestones, refitTokens: tokens - 1 }
    set({ milestones: next })
    saveJSON(KEY, persistOf(get()))
    return true
  },

  grantEmergencyRelief: (amount) => {
    set((s) => ({ funding: s.funding + amount, reliefEmergencyUsed: true }))
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
    set({
      ...saved,
      leaning: saved.leaning ?? ZERO_LEANING,
      // Back-compat: old saves won't have milestones or reliefEmergencyUsed
      milestones: saved.milestones ?? freshMilestones(),
      reliefEmergencyUsed: saved.reliefEmergencyUsed ?? false,
    })
  },

  resetForTest: () => {
    clearKey(KEY)
    set({ ...DEFAULTS, milestones: freshMilestones(), reliefEmergencyUsed: false })
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
