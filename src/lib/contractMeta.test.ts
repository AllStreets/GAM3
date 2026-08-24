import { describe, it, expect } from 'vitest'
import { archetypeForKind, capabilityForKind, matchBonusFunding, CAPABILITY_MATCH_BONUS } from './contractMeta'

describe('contractMeta', () => {
  it('maps event kinds to archetype lanes', () => {
    expect(archetypeForKind('earthquake')).toBe('relief')
    expect(archetypeForKind('wildfire')).toBe('relief')
    expect(archetypeForKind('launch')).toBe('defense')
    expect(archetypeForKind('volcano')).toBe('research')
    expect(archetypeForKind('mystery')).toBe('research') // default
  })
  it('maps event kinds to preferred capability', () => {
    expect(capabilityForKind('wildfire')).toBe('thermal')
    expect(capabilityForKind('volcano')).toBe('thermal')
    expect(capabilityForKind('launch')).toBe('comms')
    expect(capabilityForKind('earthquake')).toBe('imaging') // default
  })
  it('applies the capability match bonus to funding', () => {
    expect(matchBonusFunding(400, false)).toBe(400)
    expect(matchBonusFunding(400, true)).toBe(Math.round(400 * (1 + CAPABILITY_MATCH_BONUS)))
  })
})
