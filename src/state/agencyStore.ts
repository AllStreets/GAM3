import { create } from 'zustand'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import { STARTING_FUNDING, STARTING_REPUTATION } from '@/lib/economy'
import { refuelEfficiencyCost, refuelEfficiencyFactor } from '@/lib/upgrades'
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
  /** Agency-wide refuel efficiency upgrade level (0 = base rate, no discount). */
  refuelEfficiencyLevel: number
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
  refuelEfficiencyLevel: 0,
}

interface AgencyState extends Persisted {
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
  /**
   * Upgrade agency-wide refuel efficiency by one level.
   * Costs `refuelEfficiencyCost(refuelEfficiencyLevel)`.
   * Returns true if the upgrade was applied (false: insufficient funding).
   */
  upgradeRefuelEfficiency(): boolean
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
    refuelEfficiencyLevel: s.refuelEfficiencyLevel,
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

  upgradeRefuelEfficiency: () => {
    const level = get().refuelEfficiencyLevel
    // Defence-in-depth: refuse a purchase that wouldn't improve efficiency (past the discount floor).
    if (refuelEfficiencyFactor(level + 1) >= refuelEfficiencyFactor(level)) return false
    const cost = refuelEfficiencyCost(level)
    if (!get().spendFunding(cost)) return false
    set((s) => ({ refuelEfficiencyLevel: s.refuelEfficiencyLevel + 1 }))
    saveJSON(KEY, persistOf(get()))
    return true
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
      // Back-compat: old saves won't have refuelEfficiencyLevel
      refuelEfficiencyLevel: saved.refuelEfficiencyLevel ?? 0,
    })
  },

  resetForTest: () => {
    clearKey(KEY)
    set({ ...DEFAULTS, milestones: freshMilestones(), reliefEmergencyUsed: false, refuelEfficiencyLevel: 0 })
  },
}))

// Expose the store on window in non-production so Playwright e2e tests can
// seed funding/milestones and inspect agency state.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  ;(window as unknown as Record<string, unknown>).__agencyStore = useAgencyStore
}

export function agencyTitle(): string {
  const s = useAgencyStore.getState()
  return archetypeTitle(dominantArchetype(s.leaning), s.reputation)
}

export function agencyArchetype(): Archetype | null {
  const s = useAgencyStore.getState()
  return dominantArchetype(s.leaning)
}
