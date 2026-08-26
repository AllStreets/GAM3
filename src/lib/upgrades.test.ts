import { describe, it, expect } from 'vitest'
import {
  tankUpgradeCost,
  tankUpgradeDv,
  refuelEfficiencyCost,
  refuelEfficiencyFactor,
  RETROFIT_COST,
} from './upgrades'

describe('tankUpgradeCost', () => {
  it('escalates with level: level 0 costs §300', () => {
    expect(tankUpgradeCost(0)).toBe(300)
  })
  it('level 1 costs §600 (double)', () => {
    expect(tankUpgradeCost(1)).toBe(600)
  })
  it('level 2 costs §900', () => {
    expect(tankUpgradeCost(2)).toBe(900)
  })
  it('each successive level costs more than the previous', () => {
    for (let l = 0; l < 5; l++) {
      expect(tankUpgradeCost(l + 1)).toBeGreaterThan(tankUpgradeCost(l))
    }
  })
})

describe('tankUpgradeDv', () => {
  it('is positive at every level', () => {
    for (let l = 0; l <= 5; l++) {
      expect(tankUpgradeDv(l)).toBeGreaterThan(0)
    }
  })
  it('returns 300 m/s at level 0', () => {
    expect(tankUpgradeDv(0)).toBe(300)
  })
  it('returns a flat 300 m/s regardless of level', () => {
    expect(tankUpgradeDv(3)).toBe(300)
    expect(tankUpgradeDv(5)).toBe(300)
  })
})

describe('refuelEfficiencyCost', () => {
  it('escalates with level: level 0 costs §400', () => {
    expect(refuelEfficiencyCost(0)).toBe(400)
  })
  it('level 1 costs §800', () => {
    expect(refuelEfficiencyCost(1)).toBe(800)
  })
  it('each successive level costs more', () => {
    for (let l = 0; l < 4; l++) {
      expect(refuelEfficiencyCost(l + 1)).toBeGreaterThan(refuelEfficiencyCost(l))
    }
  })
})

describe('refuelEfficiencyFactor', () => {
  it('is exactly 1 at level 0 (no discount)', () => {
    expect(refuelEfficiencyFactor(0)).toBe(1)
  })
  it('decreases with each level', () => {
    for (let l = 0; l < 4; l++) {
      expect(refuelEfficiencyFactor(l + 1)).toBeLessThan(refuelEfficiencyFactor(l))
    }
  })
  it('floor is 0.6 — never drops below 60% of base price', () => {
    expect(refuelEfficiencyFactor(10)).toBe(0.6)
    expect(refuelEfficiencyFactor(100)).toBe(0.6)
  })
  it('level 4 = 0.6 exactly (4 × 10% = 40% off)', () => {
    expect(refuelEfficiencyFactor(4)).toBe(0.6)
  })
  it('is ≤ 1 at every level', () => {
    for (let l = 0; l <= 6; l++) {
      expect(refuelEfficiencyFactor(l)).toBeLessThanOrEqual(1)
    }
  })
})

describe('RETROFIT_COST', () => {
  it('is a positive constant number', () => {
    expect(typeof RETROFIT_COST).toBe('number')
    expect(RETROFIT_COST).toBeGreaterThan(0)
  })
  it('equals 250', () => {
    expect(RETROFIT_COST).toBe(250)
  })
})
