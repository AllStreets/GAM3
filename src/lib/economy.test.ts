import { describe, it, expect } from 'vitest'
import {
  STARTING_FUNDING, SATELLITE_PRICE, refuelPrice, rankTitle,
  maxActiveContracts, contractReward, contractDeadline,
} from './economy'

describe('economy', () => {
  it('has sane starting constants', () => {
    expect(STARTING_FUNDING).toBe(500)
    expect(SATELLITE_PRICE).toBe(800)
  })
  it('refuelPrice scales with missing dv', () => {
    expect(refuelPrice(0)).toBe(0)
    expect(refuelPrice(100)).toBe(60)
  })
  it('rankTitle climbs with reputation', () => {
    expect(rankTitle(0)).not.toBe(rankTitle(500))
    expect(typeof rankTitle(120)).toBe('string')
  })
  it('maxActiveContracts grows and caps at 5', () => {
    expect(maxActiveContracts(0)).toBe(1)
    expect(maxActiveContracts(60)).toBe(2)
    expect(maxActiveContracts(10000)).toBe(5)
  })
  it('contractReward increases with severity', () => {
    expect(contractReward(1).funding).toBeGreaterThan(contractReward(0).funding)
    expect(contractReward(0).funding).toBe(120)
  })
  it('contractDeadline is five periods out', () => {
    expect(contractDeadline(1000, 5400)).toBe(1000 + 5 * 5400)
  })
})
