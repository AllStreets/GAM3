import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import {
  MU_EARTH, ER_KM, MS_TO_ER, meanMotion, orbitalPeriod, solveKepler,
  propagate, sceneFromEci, eciFromScene,
  type OrbitalElements,
} from './orbits'

const issLike: OrbitalElements = {
  a: (6371 + 400) / 6371, e: 0.001, i: (51.6 * Math.PI) / 180,
  raan: 0.5, argp: 1.0, m0: 0, epoch: 0,
}

describe('constants', () => {
  it('MU_EARTH is the real GM converted to ER^3/s^2', () => {
    expect(MU_EARTH).toBeCloseTo(398600.4418 / 6371 ** 3, 12)
  })
  it('MS_TO_ER converts 6371 km/s to 1 ER/s', () => {
    expect(6_371_000 * MS_TO_ER).toBeCloseTo(1, 9)
  })
})

describe('orbitalPeriod', () => {
  it('gives ~92.5 minutes for a 400 km orbit', () => {
    const T = orbitalPeriod(issLike.a)
    expect(T).toBeGreaterThan(5400)
    expect(T).toBeLessThan(5700)
  })
})

describe('solveKepler', () => {
  it('returns M when e = 0', () => {
    expect(solveKepler(1.234, 0)).toBeCloseTo(1.234, 10)
  })
  it('satisfies Kepler equation residual < 1e-9 for e = 0.5', () => {
    const E = solveKepler(1.0, 0.5)
    expect(Math.abs(E - 0.5 * Math.sin(E) - 1.0)).toBeLessThan(1e-9)
  })
})

describe('propagate', () => {
  it('keeps a circular equatorial orbit at constant radius and speed', () => {
    const el: OrbitalElements = { a: 2, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
    for (const t of [0, 1000, 4321, 90000]) {
      const { position, velocity } = propagate(el, t)
      expect(position.length()).toBeCloseTo(2, 6)
      expect(velocity.length()).toBeCloseTo(Math.sqrt(MU_EARTH / 2), 9)
      expect(Math.abs(position.dot(velocity))).toBeLessThan(1e-8)
    }
  })
  it('returns to the same position after one period', () => {
    const p0 = propagate(issLike, 0).position
    const p1 = propagate(issLike, orbitalPeriod(issLike.a)).position
    expect(p0.distanceTo(p1)).toBeLessThan(1e-5)
  })
  it('respects inclination: max |z| over an orbit ~ sin(i) * a', () => {
    let maxZ = 0
    const T = orbitalPeriod(issLike.a)
    for (let k = 0; k < 200; k++) {
      maxZ = Math.max(maxZ, Math.abs(propagate(issLike, (k / 200) * T).position.z))
    }
    expect(maxZ).toBeGreaterThan(Math.sin(issLike.i) * issLike.a * 0.98)
    expect(maxZ).toBeLessThan(issLike.a * (1 + issLike.e) * Math.sin(issLike.i) * 1.02)
  })
})

describe('frame mapping', () => {
  it('maps ECI north (+z) to scene +Y', () => {
    const v = sceneFromEci(new Vector3(0, 0, 1))
    expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(1); expect(v.z).toBeCloseTo(0)
  })
  it('maps ECI +x (lon 0) to scene +Z', () => {
    const v = sceneFromEci(new Vector3(1, 0, 0))
    expect(v.z).toBeCloseTo(1)
  })
  it('eciFromScene inverts sceneFromEci', () => {
    const v = new Vector3(0.3, -0.7, 2.1)
    const back = eciFromScene(sceneFromEci(v))
    expect(back.distanceTo(v)).toBeLessThan(1e-12)
  })
})
