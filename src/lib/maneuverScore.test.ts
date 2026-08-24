import { describe, it, expect } from 'vitest'
import { scoreManeuver, detectTrickShot } from './maneuverScore'
import type { OrbitalElements } from '@/lib/orbits'

describe('scoreManeuver', () => {
  it('rewards minimal spend and tight passes', () => {
    const s = scoreManeuver({ dvNeeded: 100, dvSpent: 100, closestKm: 0, radiusKm: 500 })
    expect(s.efficiency).toBeCloseTo(1); expect(s.precision).toBeCloseTo(1); expect(s.grade).toBe('S')
  })
  it('penalizes overspend and grazing passes', () => {
    const s = scoreManeuver({ dvNeeded: 100, dvSpent: 200, closestKm: 500, radiusKm: 500 })
    expect(s.efficiency).toBeCloseTo(0.5); expect(s.precision).toBeCloseTo(0); expect(s.grade).toBe('C')
  })
  it('clamps to [0,1]', () => {
    const s = scoreManeuver({ dvNeeded: 300, dvSpent: 100, closestKm: 900, radiusKm: 500 })
    expect(s.efficiency).toBe(1); expect(s.precision).toBe(0)
  })
})

describe('detectTrickShot', () => {
  const el: OrbitalElements = { a: (6371+500)/6371, e: 0.001, i: 0.9, raan: 0.5, argp: 0.3, m0: 0, epoch: 0 }
  it('flags reaching two targets in one window as a trick-shot', () => {
    // two targets straddling the ground-track; generous radius makes both reachable
    const r = detectTrickShot({ elements: el, targets: [{lat:0,lon:0},{lat:0,lon:5}], fromT: 0, windowSec: 6000, radiusKm: 3000 })
    expect(r.count).toBeGreaterThanOrEqual(2); expect(r.isTrickShot).toBe(true)
  })
  it('single reachable target is not a trick-shot', () => {
    const r = detectTrickShot({ elements: el, targets: [{lat:0,lon:0},{lat:80,lon:120}], fromT: 0, windowSec: 6000, radiusKm: 200 })
    expect(r.isTrickShot).toBe(false)
  })
})
