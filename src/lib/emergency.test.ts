import { describe, it, expect } from 'vitest'
import {
  shouldSpawnConjunction,
  makeConjunction,
  isResolvedByBurn,
  isExpired,
} from './emergency'

describe('shouldSpawnConjunction', () => {
  const base = { now: 1000, lastSpawnAt: 0, minGapSec: 600, fleetSize: 3, roll: 0.05 }

  it('returns true when gap is met and roll is below threshold', () => {
    expect(shouldSpawnConjunction(base)).toBe(true)
  })

  it('returns false when gap has not elapsed', () => {
    expect(shouldSpawnConjunction({ ...base, lastSpawnAt: 500 })).toBe(false)
  })

  it('returns false when roll is at or above per-fleet chance (0.08)', () => {
    expect(shouldSpawnConjunction({ ...base, roll: 0.08 })).toBe(false)
    expect(shouldSpawnConjunction({ ...base, roll: 0.99 })).toBe(false)
  })

  it('returns true when roll is just below the threshold', () => {
    expect(shouldSpawnConjunction({ ...base, roll: 0.0799 })).toBe(true)
  })

  it('returns false when fleetSize is 0', () => {
    expect(shouldSpawnConjunction({ ...base, fleetSize: 0 })).toBe(false)
  })

  it('respects gap exactly at the boundary — strictly less than minGapSec is false', () => {
    // now - lastSpawnAt === minGapSec — exactly equal means gap is met (≥)
    expect(shouldSpawnConjunction({ ...base, now: 600, lastSpawnAt: 0 })).toBe(true)
    // now - lastSpawnAt < minGapSec — should be false
    expect(shouldSpawnConjunction({ ...base, now: 599, lastSpawnAt: 0 })).toBe(false)
  })
})

describe('makeConjunction', () => {
  it('sets deadline = now + leadSec (default 240)', () => {
    const c = makeConjunction('hyp-1', 1000)
    expect(c.satId).toBe('hyp-1')
    expect(c.startedAt).toBe(1000)
    expect(c.deadline).toBe(1240)
  })

  it('sets requiredDv to the default 120 when not provided', () => {
    const c = makeConjunction('hyp-2', 500)
    expect(c.requiredDv).toBe(120)
  })

  it('accepts custom requiredDv and leadSec', () => {
    const c = makeConjunction('hyp-3', 2000, 80, 300)
    expect(c.requiredDv).toBe(80)
    expect(c.deadline).toBe(2300)
  })
})

describe('isResolvedByBurn', () => {
  const c = makeConjunction('hyp-1', 0, 120)

  it('returns true when dvSpent >= requiredDv', () => {
    expect(isResolvedByBurn(c, 120)).toBe(true)
    expect(isResolvedByBurn(c, 200)).toBe(true)
  })

  it('returns false when dvSpent < requiredDv', () => {
    expect(isResolvedByBurn(c, 119)).toBe(false)
    expect(isResolvedByBurn(c, 0)).toBe(false)
  })
})

describe('isExpired', () => {
  const c = makeConjunction('hyp-1', 1000, 120, 240) // deadline = 1240

  it('returns true when now > deadline', () => {
    expect(isExpired(c, 1241)).toBe(true)
  })

  it('returns false when now <= deadline', () => {
    expect(isExpired(c, 1240)).toBe(false)
    expect(isExpired(c, 1000)).toBe(false)
  })
})
