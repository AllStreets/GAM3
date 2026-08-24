import { describe, it, expect } from 'vitest'
import { seedCapability, fillGapCapability, freshRecord, simDaysInOrbit, CAPABILITY_LABEL } from './satelliteMeta'

describe('satelliteMeta', () => {
  it('seeds a deterministic capability spread across the starting fleet', () => {
    const caps = [0,1,2,3,4].map(seedCapability)
    expect(caps).toEqual(['imaging','imaging','comms','thermal','comms'])
  })
  it('fills the least-represented capability', () => {
    expect(fillGapCapability(['imaging','imaging','comms'])).toBe('thermal')
    expect(fillGapCapability(['imaging','comms','thermal'])).toBe('imaging') // tie → imaging
  })
  it('freshRecord starts empty at the commission time', () => {
    const r = freshRecord(123)
    expect(r).toEqual({ contractsCompleted: 0, notablePasses: [], commissionedAt: 123 })
  })
  it('simDaysInOrbit floors elapsed sim-days and never goes negative', () => {
    expect(simDaysInOrbit(0, 86400 * 3.7)).toBe(3)
    expect(simDaysInOrbit(100, 0)).toBe(0)
  })
  it('exposes on-brand capability labels', () => {
    expect(CAPABILITY_LABEL.imaging).toBe('OPTICAL')
    expect(CAPABILITY_LABEL.comms).toBe('RELAY')
    expect(CAPABILITY_LABEL.thermal).toBe('THERMAL')
  })
})
