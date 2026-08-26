import { describe, it, expect } from 'vitest'
import { planeForTarget } from './aimPlane'
import { isTargetReachable } from './reachability'
import type { OrbitalElements } from './orbits'

const RAD_TO_DEG = 180 / Math.PI

describe('planeForTarget', () => {
  it('is deterministic: same inputs → same output', () => {
    const a = planeForTarget(35, 139, 0)
    const b = planeForTarget(35, 139, 0)
    expect(a).toEqual(b)
  })

  it('returns inclination ≥ |lat| for a mid-latitude target', () => {
    const el = planeForTarget(35, 139, 0)
    const iDeg = el.i! * RAD_TO_DEG
    expect(iDeg).toBeGreaterThanOrEqual(35)
  })

  it('inclination is |lat| + 5° for typical target', () => {
    const el = planeForTarget(35, 139, 0)
    const iDeg = el.i! * RAD_TO_DEG
    expect(iDeg).toBeCloseTo(40, 5)
  })

  it('inclination ≥ |lat| for polar target (80°N)', () => {
    const el = planeForTarget(80, 20, 0)
    const iDeg = el.i! * RAD_TO_DEG
    expect(iDeg).toBeGreaterThanOrEqual(80)
  })

  it('inclination ≥ |lat| for southern hemisphere (-45°)', () => {
    const el = planeForTarget(-45, 170, 0)
    const iDeg = el.i! * RAD_TO_DEG
    expect(iDeg).toBeGreaterThanOrEqual(45)
  })

  it('clamps inclination at 5° minimum for equatorial target', () => {
    const el = planeForTarget(0, 0, 0)
    const iDeg = el.i! * RAD_TO_DEG
    expect(iDeg).toBeGreaterThanOrEqual(5)
  })

  it('clamps inclination at MAX_I_DEG (~99°) for extreme polar target (>94°)', () => {
    // lat=95 would give 100°, clamped to 99°
    const el = planeForTarget(95, 0, 0)
    const iDeg = el.i! * RAD_TO_DEG
    expect(iDeg).toBeLessThanOrEqual(99)
  })

  it('isTargetReachable returns true for a mid-latitude target', () => {
    const partial = planeForTarget(35, 139, 0)
    // Build a full OrbitalElements from the partial (rest filled with defaults)
    const el: OrbitalElements = {
      a: partial.a!,
      e: partial.e!,
      i: partial.i!,
      raan: partial.raan!,
      argp: partial.argp!,
      m0: partial.m0!,
      epoch: partial.epoch!,
    }
    expect(isTargetReachable(el, 35)).toBe(true)
  })

  it('isTargetReachable returns true for an arctic target (80°N)', () => {
    const partial = planeForTarget(80, 20, 0)
    const el: OrbitalElements = {
      a: partial.a!,
      e: partial.e!,
      i: partial.i!,
      raan: partial.raan!,
      argp: partial.argp!,
      m0: partial.m0!,
      epoch: partial.epoch!,
    }
    expect(isTargetReachable(el, 80)).toBe(true)
  })

  it('isTargetReachable returns true for a southern hemisphere target (-45°)', () => {
    const partial = planeForTarget(-45, 170, 0)
    const el: OrbitalElements = {
      a: partial.a!,
      e: partial.e!,
      i: partial.i!,
      raan: partial.raan!,
      argp: partial.argp!,
      m0: partial.m0!,
      epoch: partial.epoch!,
    }
    expect(isTargetReachable(el, -45)).toBe(true)
  })

  it('different indices give different argp and m0', () => {
    const a = planeForTarget(35, 139, 0)
    const b = planeForTarget(35, 139, 1)
    const c = planeForTarget(35, 139, 2)
    // Same inclination/raan for same lat/lon
    expect(a.i).toBe(b.i)
    expect(a.raan).toBe(b.raan)
    // Different phase/argp
    expect(a.m0).not.toBe(b.m0)
    expect(b.m0).not.toBe(c.m0)
  })

  it('different longitudes give different RAAN', () => {
    const a = planeForTarget(35, 0, 0)
    const b = planeForTarget(35, 90, 0)
    expect(a.raan).not.toBe(b.raan)
  })

  it('returns a small eccentricity (near-circular)', () => {
    const el = planeForTarget(35, 139, 0)
    expect(el.e!).toBeCloseTo(0.001, 5)
  })

  it('returns a LEO semi-major axis (~500 km altitude)', () => {
    const el = planeForTarget(35, 139, 0)
    // 500 km altitude → a = (6371 + 500) / 6371 ≈ 1.0785
    expect(el.a!).toBeCloseTo((6371 + 500) / 6371, 3)
  })

  it('epoch is 0 (satellite placed at sim-epoch)', () => {
    const el = planeForTarget(35, 139, 0)
    expect(el.epoch).toBe(0)
  })
})
