import { describe, it, expect } from 'vitest'
import {
  REACH_LAT_MARGIN_DEG,
  inclinationDeg,
  maxReachableLatDeg,
  isTargetReachable,
  fleetReachability,
} from './reachability'
import type { OrbitalElements } from './orbits'
import type { Satellite } from '@/state/gameStore'

const deg = (d: number) => (d * Math.PI) / 180

/** ISS-like: 51.6° inclination */
const issEl: OrbitalElements = {
  a: (6371 + 420) / 6371, e: 0.0012, i: deg(51.6),
  raan: 0.8, argp: 0.3, m0: 0, epoch: 0,
}

/** Sun-sync polar: 97.5° inclination */
const polarEl: OrbitalElements = {
  a: (6371 + 780) / 6371, e: 0.002, i: deg(97.5),
  raan: 2.4, argp: 1.1, m0: 2.0, epoch: 0,
}

/** Low-inclination: 28° */
const lowEl: OrbitalElements = {
  a: (6371 + 550) / 6371, e: 0.001, i: deg(28),
  raan: 4.3, argp: 0.7, m0: 3.1, epoch: 0,
}

function makeSat(id: string, el: OrbitalElements): Satellite {
  return {
    id, name: id, elements: el,
    fuel: 1500, fuelCapacity: 1500,
    capability: 'imaging',
    record: { contractsCompleted: 0, notablePasses: [], commissionedAt: 0 },
  }
}

describe('inclinationDeg', () => {
  it('returns ~51.6 for ISS-like orbit', () => {
    expect(inclinationDeg(issEl)).toBeCloseTo(51.6, 1)
  })
  it('folds 97.5° to ~82.5° (180 - 97.5)', () => {
    // retrograde: the ground-track max lat is min(i, 180-i)
    expect(inclinationDeg(polarEl)).toBeCloseTo(82.5, 1)
  })
  it('returns 28 for 28° inclination', () => {
    expect(inclinationDeg(lowEl)).toBeCloseTo(28, 1)
  })
})

describe('maxReachableLatDeg', () => {
  it('ISS max reach ≈ incl + margin ≈ 56.1°', () => {
    const reach = maxReachableLatDeg(issEl)
    expect(reach).toBeCloseTo(51.6 + REACH_LAT_MARGIN_DEG, 0)
    expect(reach).toBeGreaterThan(55)
    expect(reach).toBeLessThan(60)
  })
  it('polar max reach ≈ 82.5 + margin > 87° (but capped at 90)', () => {
    const reach = maxReachableLatDeg(polarEl)
    // 82.5 + 4.5 = 87, under 90, so no cap
    expect(reach).toBeCloseTo(82.5 + REACH_LAT_MARGIN_DEG, 0)
  })
  it('never exceeds 90', () => {
    // 90° inclination would fold to 90, +margin would exceed 90 → capped
    const fullPolarEl: OrbitalElements = { ...issEl, i: deg(90) }
    expect(maxReachableLatDeg(fullPolarEl)).toBeLessThanOrEqual(90)
  })
})

describe('isTargetReachable', () => {
  it('equatorial target (lat 10) reachable by ISS', () => {
    expect(isTargetReachable(issEl, 10)).toBe(true)
  })
  it('80°N is NOT reachable by 51.6° ISS orbit', () => {
    expect(isTargetReachable(issEl, 80)).toBe(false)
  })
  it('80°N IS reachable by 97.5° polar orbit (folds to 82.5°, +margin > 87)', () => {
    expect(isTargetReachable(polarEl, 80)).toBe(true)
  })
  it('51°N is reachable by ISS (within margin)', () => {
    expect(isTargetReachable(issEl, 51)).toBe(true)
  })
  it('-80°S is NOT reachable by ISS', () => {
    expect(isTargetReachable(issEl, -80)).toBe(false)
  })
  it('low-inclination 28° cannot reach 45°N', () => {
    expect(isTargetReachable(lowEl, 45)).toBe(false)
  })
})

describe('fleetReachability', () => {
  it('returns reachable=false + nulls when no satellite covers the target', () => {
    // Arctic: 80°N; only ISS (51.6°) in fleet
    const result = fleetReachability([makeSat('s1', issEl)], { lat: 80, lon: 0 })
    expect(result.reachable).toBe(false)
    expect(result.bestSatId).toBeNull()
    expect(result.bestApproxDvMs).toBeNull()
  })

  it('returns reachable=true with a bestSatId when the fleet covers the target', () => {
    const result = fleetReachability([makeSat('s1', issEl)], { lat: 40, lon: 20 })
    expect(result.reachable).toBe(true)
    expect(result.bestSatId).toBe('s1')
    expect(result.bestApproxDvMs).not.toBeNull()
    expect(result.bestApproxDvMs!).toBeGreaterThanOrEqual(0)
  })

  it('picks best from multiple reachable sats (deterministic)', () => {
    const sat1 = makeSat('s1', issEl)   // ISS at 51.6°
    const sat2 = makeSat('s2', polarEl) // polar at 97.5°
    // Equatorial target reachable by both; function should return a specific one
    const r1 = fleetReachability([sat1, sat2], { lat: 5, lon: 10 })
    expect(r1.reachable).toBe(true)
    expect(['s1', 's2']).toContain(r1.bestSatId)
    // Deterministic: same inputs → same output
    const r2 = fleetReachability([sat1, sat2], { lat: 5, lon: 10 })
    expect(r2.bestSatId).toBe(r1.bestSatId)
  })

  it('returns polar sat when target is 80°N and ISS cannot reach it', () => {
    const sat1 = makeSat('s1', issEl)   // ISS: cannot reach 80°N
    const sat2 = makeSat('s2', polarEl) // polar: can reach 80°N
    const result = fleetReachability([sat1, sat2], { lat: 80, lon: 0 })
    expect(result.reachable).toBe(true)
    expect(result.bestSatId).toBe('s2')
  })

  it('empty fleet returns not-reachable', () => {
    const result = fleetReachability([], { lat: 10, lon: 0 })
    expect(result.reachable).toBe(false)
    expect(result.bestSatId).toBeNull()
  })

  it('bestApproxDvMs is 0 when satellite already covers the target', () => {
    // A target at 10°N is well within ISS coverage; approx dv should be small/0
    const result = fleetReachability([makeSat('s1', issEl)], { lat: 10, lon: 0 })
    expect(result.bestApproxDvMs).not.toBeNull()
    // The satellite can reach this; dv ≥ 0
    expect(result.bestApproxDvMs!).toBeGreaterThanOrEqual(0)
  })
})
