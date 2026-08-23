import { describe, it, expect, beforeEach } from 'vitest'
import { useAgencyStore } from './agencyStore'
import { STARTING_FUNDING } from '@/lib/economy'

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
})
