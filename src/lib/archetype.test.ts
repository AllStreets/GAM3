import { describe, it, expect } from 'vitest'
import { advanceLeaning, dominantArchetype, archetypeDescriptor, archetypeTitle, ZERO_LEANING } from './archetype'

describe('archetype', () => {
  it('accumulates leaning by tag', () => {
    let l = ZERO_LEANING
    l = advanceLeaning(l, 'relief')
    l = advanceLeaning(l, 'relief', 2)
    l = advanceLeaning(l, 'defense')
    expect(l).toEqual({ relief: 3, research: 0, defense: 1 })
  })
  it('returns null dominant when unplayed', () => {
    expect(dominantArchetype(ZERO_LEANING)).toBeNull()
  })
  it('picks the dominant axis, breaking ties relief>research>defense', () => {
    expect(dominantArchetype({ relief: 2, research: 1, defense: 0 })).toBe('relief')
    expect(dominantArchetype({ relief: 2, research: 2, defense: 1 })).toBe('relief')
    expect(dominantArchetype({ relief: 0, research: 3, defense: 3 })).toBe('research')
  })
  it('descriptors are on-brand and null is Startup Outfit', () => {
    expect(archetypeDescriptor(null)).toBe('Startup Outfit')
    expect(archetypeDescriptor('defense')).toBe('Strategic Watch')
  })
  it('title combines a rank tier with the descriptor', () => {
    expect(archetypeTitle(null, 0)).toContain('Startup Outfit')
    expect(archetypeTitle('relief', 300)).toMatch(/·/)
  })
})
