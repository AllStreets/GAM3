import { describe, it, expect } from 'vitest'
import { isAgencyStuck } from './recovery'
import { affordableRefuelDv, refuelPricePerDv } from './economy'

// ─── affordableRefuelDv ───────────────────────────────────────────────────────

describe('affordableRefuelDv', () => {
  const PRICE = 0.6 // base rate, matches refuelPricePerDv(0)

  it('returns the full missing amount when the player can afford it', () => {
    // missing=100, funds=200, pricePerDv=0.6 → floor(min(100, 200/0.6)) = floor(min(100,333)) = 100
    expect(affordableRefuelDv(100, 200, PRICE)).toBe(100)
  })

  it('returns a partial amount when funds are limited', () => {
    // missing=1000, funds=60, pricePerDv=0.6 → floor(min(1000, 100)) = 100
    expect(affordableRefuelDv(1000, 60, PRICE)).toBe(100)
  })

  it('returns 0 when the player has no funds', () => {
    expect(affordableRefuelDv(500, 0, PRICE)).toBe(0)
  })

  it('returns 0 when missingDv is 0 (tank full)', () => {
    expect(affordableRefuelDv(0, 500, PRICE)).toBe(0)
  })

  it('is capped by missingDv even if the player has huge funds', () => {
    expect(affordableRefuelDv(50, 9999, PRICE)).toBe(50)
  })

  it('returns an integer (floor)', () => {
    // 100 / 0.6 = 166.66… → floor = 166
    const result = affordableRefuelDv(200, 100, PRICE)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(166)
  })
})

// ─── refuelPricePerDv ─────────────────────────────────────────────────────────

describe('refuelPricePerDv', () => {
  it('at level 0 equals 0.6 (base rate matching refuelPrice)', () => {
    expect(refuelPricePerDv(0)).toBeCloseTo(0.6)
    expect(refuelPricePerDv()).toBeCloseTo(0.6)
  })

  it('full-refuel price is unchanged vs refuelPrice at level 0', () => {
    // ceil(missing * refuelPricePerDv(0)) must equal ceil(missing * 0.6)
    // which is exactly what refuelPrice() does.
    const missing = 500
    const pricePerDv = refuelPricePerDv(0)
    expect(Math.ceil(missing * pricePerDv)).toBe(Math.ceil(missing * 0.6))
  })

  it('higher efficiency levels produce lower prices', () => {
    expect(refuelPricePerDv(1)).toBeLessThan(refuelPricePerDv(0))
    expect(refuelPricePerDv(5)).toBeLessThan(refuelPricePerDv(1))
  })

  it('price is always >= 0.1 (floor)', () => {
    expect(refuelPricePerDv(100)).toBeGreaterThanOrEqual(0.1)
  })
})

// ─── isAgencyStuck ───────────────────────────────────────────────────────────

const BASE_SAT = { fuel: 0, fuelCapacity: 1500 }
const PRICE_PER_DV = 0.6
const SAT_PRICE = 800

describe('isAgencyStuck', () => {
  it('returns false when there are no active contracts', () => {
    expect(isAgencyStuck({
      fleet: [{ ...BASE_SAT, fuel: 0 }],
      funds: 0,
      activeTargetsBestDv: [],
      satellitePrice: SAT_PRICE,
      pricePerDv: PRICE_PER_DV,
    })).toBe(false)
  })

  it('returns true when broke + all satellites dry + target reachable with refuel but can\'t afford it', () => {
    // Contract needs 100 Δv, satellite has 0, refuel costs ceil(100*0.6)=60, funds=0
    expect(isAgencyStuck({
      fleet: [{ fuel: 0, fuelCapacity: 1500 }],
      funds: 0,
      activeTargetsBestDv: [100],
      satellitePrice: SAT_PRICE,
      pricePerDv: PRICE_PER_DV,
    })).toBe(true)
  })

  it('returns false when a satellite already has enough fuel', () => {
    expect(isAgencyStuck({
      fleet: [{ fuel: 200, fuelCapacity: 1500 }],
      funds: 0,
      activeTargetsBestDv: [100],
      satellitePrice: SAT_PRICE,
      pricePerDv: PRICE_PER_DV,
    })).toBe(false)
  })

  it('returns false when the player can afford enough refuel to close the gap', () => {
    // Needs 100 Δv, sat has 0, refuel gap = 100, cost = ceil(100*0.6) = 60, funds = 100
    expect(isAgencyStuck({
      fleet: [{ fuel: 0, fuelCapacity: 1500 }],
      funds: 100,
      activeTargetsBestDv: [100],
      satellitePrice: SAT_PRICE,
      pricePerDv: PRICE_PER_DV,
    })).toBe(false)
  })

  it('returns false when the player can buy a new satellite', () => {
    expect(isAgencyStuck({
      fleet: [{ fuel: 0, fuelCapacity: 1500 }],
      funds: SAT_PRICE,
      activeTargetsBestDv: [100],
      satellitePrice: SAT_PRICE,
      pricePerDv: PRICE_PER_DV,
    })).toBe(false)
  })

  it('returns false when a contract has a null bestDv but another is reachable', () => {
    // One unreachable (null), one contract where sat has enough fuel
    expect(isAgencyStuck({
      fleet: [{ fuel: 200, fuelCapacity: 1500 }],
      funds: 0,
      activeTargetsBestDv: [null, 100],
      satellitePrice: SAT_PRICE,
      pricePerDv: PRICE_PER_DV,
    })).toBe(false)
  })

  it('returns true when all contracts are either unreachable or unaffordable and can\'t buy new sat', () => {
    // Two contracts: one unreachable (null), one requiring 100Δv but sat has 0 fuel and funds=0
    expect(isAgencyStuck({
      fleet: [{ fuel: 0, fuelCapacity: 1500 }],
      funds: 0,
      activeTargetsBestDv: [null, 100],
      satellitePrice: SAT_PRICE,
      pricePerDv: PRICE_PER_DV,
    })).toBe(true)
  })

  it('returns false when one of multiple contracts has a sat with enough fuel', () => {
    // Two contracts: one that needs 2000 Δv (impossible), one that the sat can fly
    expect(isAgencyStuck({
      fleet: [{ fuel: 500, fuelCapacity: 1500 }],
      funds: 0,
      activeTargetsBestDv: [2000, 100],
      satellitePrice: SAT_PRICE,
      pricePerDv: PRICE_PER_DV,
    })).toBe(false)
  })
})
