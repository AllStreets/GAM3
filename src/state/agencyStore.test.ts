import { describe, it, expect, beforeEach } from 'vitest'
import { useAgencyStore, agencyTitle, agencyArchetype } from './agencyStore'
import { STARTING_FUNDING } from '@/lib/economy'
import { saveJSON } from '@/lib/persist'

beforeEach(() => useAgencyStore.getState().resetForTest())

// ─── freshMilestones in default state ────────────────────────────────────────

describe('agencyStore — milestones & refit tokens', () => {
  it('starts with zeroed milestones', () => {
    const s = useAgencyStore.getState()
    expect(s.milestones.completed).toBe(0)
    expect(s.milestones.reliefGrantsClaimed).toBe(0)
    expect(s.milestones.refitTokens).toBe(0)
  })

  it('1st–4th completion: recordCompletionMilestone grants nothing', () => {
    for (let i = 0; i < 4; i++) {
      const { grantedFunding, grantedTokens } = useAgencyStore.getState().recordCompletionMilestone()
      expect(grantedFunding).toBe(0)
      expect(grantedTokens).toBe(0)
    }
    expect(useAgencyStore.getState().milestones.completed).toBe(4)
    expect(useAgencyStore.getState().milestones.refitTokens).toBe(0)
  })

  it('5th completion grants §200 relief funding and 1 refit token (separate from contract award)', () => {
    const fundingBefore = useAgencyStore.getState().funding
    // Simulate 4 non-milestone completions
    for (let i = 0; i < 4; i++) useAgencyStore.getState().recordCompletionMilestone()
    const fundingBeforeMilestone = useAgencyStore.getState().funding
    // 5th completion — the milestone
    const { grantedFunding, grantedTokens } = useAgencyStore.getState().recordCompletionMilestone()
    expect(grantedFunding).toBe(200)
    expect(grantedTokens).toBe(1)
    // Funding was increased by the milestone grant
    expect(useAgencyStore.getState().funding).toBe(fundingBeforeMilestone + 200)
    // Refit token available
    expect(useAgencyStore.getState().milestones.refitTokens).toBe(1)
    // Sanity: no grants on in-between calls (total from 4 = 0, plus 200 from 5th)
    expect(useAgencyStore.getState().funding - fundingBefore).toBe(200)
  })

  it('10th completion grants §240 and another token (accumulated)', () => {
    for (let i = 0; i < 9; i++) useAgencyStore.getState().recordCompletionMilestone()
    const { grantedFunding, grantedTokens } = useAgencyStore.getState().recordCompletionMilestone()
    expect(grantedFunding).toBe(240)
    expect(grantedTokens).toBe(1)
    expect(useAgencyStore.getState().milestones.refitTokens).toBe(2) // 2 total
  })

  it('spendRefitToken decrements the pool and returns true', () => {
    // Earn a token at the 5th completion
    for (let i = 0; i < 5; i++) useAgencyStore.getState().recordCompletionMilestone()
    expect(useAgencyStore.getState().milestones.refitTokens).toBe(1)
    const ok = useAgencyStore.getState().spendRefitToken()
    expect(ok).toBe(true)
    expect(useAgencyStore.getState().milestones.refitTokens).toBe(0)
  })

  it('spendRefitToken returns false when no tokens available', () => {
    expect(useAgencyStore.getState().milestones.refitTokens).toBe(0)
    expect(useAgencyStore.getState().spendRefitToken()).toBe(false)
  })

  it('recordCompletionMilestone resets reliefEmergencyUsed', () => {
    // Mark it used
    useAgencyStore.getState().grantEmergencyRelief(10) // sets reliefEmergencyUsed=true
    expect(useAgencyStore.getState().reliefEmergencyUsed).toBe(true)
    // Any completion resets the guard
    useAgencyStore.getState().recordCompletionMilestone()
    expect(useAgencyStore.getState().reliefEmergencyUsed).toBe(false)
  })

  it('grantEmergencyRelief adds funding and sets reliefEmergencyUsed=true', () => {
    const before = useAgencyStore.getState().funding
    useAgencyStore.getState().grantEmergencyRelief(150)
    expect(useAgencyStore.getState().funding).toBe(before + 150)
    expect(useAgencyStore.getState().reliefEmergencyUsed).toBe(true)
  })

  it('hydrate back-compat: old saves without milestones fields get freshMilestones()', () => {
    saveJSON('hyperion-agency-v1', {
      founded: true, name: 'Old Agency', emblemId: 'crest-rings',
      colorway: '#45d8ff', funding: 1000, reputation: 50,
      leaning: { relief: 0, research: 0, defense: 0 },
      // no milestones or reliefEmergencyUsed
    })
    useAgencyStore.getState().hydrate()
    const s = useAgencyStore.getState()
    expect(s.milestones).toEqual({ completed: 0, reliefGrantsClaimed: 0, refitTokens: 0 })
    expect(s.reliefEmergencyUsed).toBe(false)
  })
})

describe('agencyStore', () => {
  it('starts un-founded with starting funding', () => {
    const s = useAgencyStore.getState()
    expect(s.founded).toBe(false)
    expect(s.funding).toBe(STARTING_FUNDING)
  })
  it('found() stamps identity and marks founded', () => {
    useAgencyStore.getState().found('Aegis Orbital', 'crest-eye', '#45d8ff')
    const s = useAgencyStore.getState()
    expect(s.founded).toBe(true)
    expect(s.name).toBe('Aegis Orbital')
    expect(s.emblemId).toBe('crest-eye')
    expect(s.colorway).toBe('#45d8ff')
  })
  it('spendFunding deducts when affordable, refuses otherwise', () => {
    expect(useAgencyStore.getState().spendFunding(100)).toBe(true)
    expect(useAgencyStore.getState().funding).toBe(STARTING_FUNDING - 100)
    expect(useAgencyStore.getState().spendFunding(9_999_999)).toBe(false)
  })
  it('reputation never goes below zero', () => {
    useAgencyStore.getState().addReputation(-50)
    expect(useAgencyStore.getState().reputation).toBe(0)
  })

  // Archetype tests
  it('founding leaves leaning zero → title "Startup Outfit"', () => {
    useAgencyStore.getState().found('Test Agency', 'crest-rings', '#45d8ff')
    expect(agencyTitle()).toContain('Startup Outfit')
    expect(agencyArchetype()).toBeNull()
  })
  it('advanceArchetype accumulates leaning; dominant becomes relief after 2 relief + 1 defense', () => {
    useAgencyStore.getState().advanceArchetype('relief')
    useAgencyStore.getState().advanceArchetype('relief')
    useAgencyStore.getState().advanceArchetype('defense')
    expect(agencyArchetype()).toBe('relief')
  })
  it('hydrate backfills missing leaning from old saves', () => {
    // Simulate an old save without the leaning field
    saveJSON('hyperion-agency-v1', {
      founded: true,
      name: 'Old Agency',
      emblemId: 'crest-rings',
      colorway: '#45d8ff',
      funding: 1000,
      reputation: 50,
      // no leaning field
    })
    useAgencyStore.getState().hydrate()
    const s = useAgencyStore.getState()
    expect(s.leaning).toEqual({ relief: 0, research: 0, defense: 0 })
    expect(agencyTitle()).toContain('Startup Outfit')
  })
})
