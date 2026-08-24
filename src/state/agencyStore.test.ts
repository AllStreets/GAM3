import { describe, it, expect, beforeEach } from 'vitest'
import { useAgencyStore, agencyTitle, agencyArchetype } from './agencyStore'
import { STARTING_FUNDING } from '@/lib/economy'
import { saveJSON } from '@/lib/persist'

beforeEach(() => useAgencyStore.getState().resetForTest())

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
