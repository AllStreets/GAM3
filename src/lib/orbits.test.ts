import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import {
  MU_EARTH, ER_KM, MS_TO_ER, meanMotion, orbitalPeriod, solveKepler,
  propagate, sceneFromEci, eciFromScene,
  type OrbitalElements,
} from './orbits'
import { elementsFromState, applyDeltaV, orbitPathPoints, apoapsis, periapsis } from './orbits'

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

describe('elementsFromState', () => {
  it('round-trips: elements -> state -> elements agree on future propagation', () => {
    const t0 = 12345
    const s0 = propagate(issLike, t0)
    const el2 = elementsFromState(s0.position, s0.velocity, t0)
    for (const dt of [0, 500, 3000]) {
      const a = propagate(issLike, t0 + dt).position
      const b = propagate(el2, t0 + dt).position
      expect(a.distanceTo(b)).toBeLessThan(1e-6)
    }
  })
  it('recovers a, e, i for the seed orbit', () => {
    const s = propagate(issLike, 999)
    const el2 = elementsFromState(s.position, s.velocity, 999)
    expect(el2.a).toBeCloseTo(issLike.a, 6)
    expect(el2.e).toBeCloseTo(issLike.e, 5)
    expect(el2.i).toBeCloseTo(issLike.i, 6)
  })
})

describe('applyDeltaV', () => {
  it('prograde burn raises apoapsis and energy', () => {
    const el2 = applyDeltaV(issLike, 100, { prograde: 50 * MS_TO_ER, normal: 0, radial: 0 })
    expect(apoapsis(el2)).toBeGreaterThan(apoapsis(issLike))
    expect(el2.a).toBeGreaterThan(issLike.a)
  })
  it('retrograde burn lowers periapsis', () => {
    const el2 = applyDeltaV(issLike, 100, { prograde: -50 * MS_TO_ER, normal: 0, radial: 0 })
    expect(periapsis(el2)).toBeLessThan(periapsis(issLike))
  })
  it('normal burn changes inclination-plane (orbit normal direction)', () => {
    const el2 = applyDeltaV(issLike, 100, { prograde: 0, normal: 200 * MS_TO_ER, radial: 0 })
    expect(Math.abs(el2.i - issLike.i)).toBeGreaterThan(1e-4)
  })
  it('zero burn is identity (propagation-equivalent)', () => {
    const el2 = applyDeltaV(issLike, 777, { prograde: 0, normal: 0, radial: 0 })
    const a = propagate(issLike, 2000).position
    const b = propagate(el2, 2000).position
    expect(a.distanceTo(b)).toBeLessThan(1e-6)
  })
})

describe('orbitPathPoints', () => {
  it('returns the requested number of points, all on the ellipse radius range', () => {
    const pts = orbitPathPoints(issLike, 64)
    expect(pts).toHaveLength(64)
    for (const p of pts) {
      expect(p.length()).toBeGreaterThanOrEqual(periapsis(issLike) - 1e-9)
      expect(p.length()).toBeLessThanOrEqual(apoapsis(issLike) + 1e-9)
    }
  })
})
