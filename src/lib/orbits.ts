import { Vector3 } from 'three'

/** Earth radius in km — the scene unit is 1 Earth radius. */
export const ER_KM = 6371
/** GM of Earth in ER^3/s^2. */
export const MU_EARTH = 398600.4418 / ER_KM ** 3
/** Convert m/s to ER/s. */
export const MS_TO_ER = 1 / (ER_KM * 1000)

const TWO_PI = Math.PI * 2

export interface OrbitalElements {
  a: number     // semi-major axis, ER
  e: number     // eccentricity [0, 1)
  i: number     // inclination, rad
  raan: number  // right ascension of ascending node, rad
  argp: number  // argument of periapsis, rad
  m0: number    // mean anomaly at epoch, rad
  epoch: number // sim time, seconds
}

export interface StateVector {
  position: Vector3 // ECI, ER
  velocity: Vector3 // ECI, ER/s
}

export function meanMotion(a: number): number {
  return Math.sqrt(MU_EARTH / (a * a * a))
}

export function orbitalPeriod(a: number): number {
  return TWO_PI / meanMotion(a)
}

export function normalizeAngle(x: number): number {
  const y = x % TWO_PI
  return y < 0 ? y + TWO_PI : y
}

/** Newton-solve E - e·sin(E) = M. */
export function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI
  for (let k = 0; k < 15; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-12) break
  }
  return E
}

/** Rotate perifocal (PQW) coordinates into ECI: Rz(raan) · Rx(i) · Rz(argp). */
function pqwToEci(el: OrbitalElements, x: number, y: number): Vector3 {
  const cO = Math.cos(el.raan), sO = Math.sin(el.raan)
  const ci = Math.cos(el.i), si = Math.sin(el.i)
  const cw = Math.cos(el.argp), sw = Math.sin(el.argp)
  return new Vector3(
    (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y,
    (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y,
    sw * si * x + cw * si * y,
  )
}

export function propagate(el: OrbitalElements, t: number): StateVector {
  const M = normalizeAngle(el.m0 + meanMotion(el.a) * (t - el.epoch))
  const E = solveKepler(M, el.e)
  const cosE = Math.cos(E), sinE = Math.sin(E)
  const sq = Math.sqrt(1 - el.e * el.e)
  const r = el.a * (1 - el.e * cosE)

  const xP = el.a * (cosE - el.e)
  const yP = el.a * sq * sinE
  const vf = Math.sqrt(MU_EARTH * el.a) / r
  const vxP = -vf * sinE
  const vyP = vf * sq * cosE

  return { position: pqwToEci(el, xP, yP), velocity: pqwToEci(el, vxP, vyP) }
}

/** ECI (z = north, x = lon 0, y = lon 90°E) → scene (Y-up, matches latLonToVector3). */
export function sceneFromEci(v: Vector3): Vector3 {
  return new Vector3(v.y, v.z, v.x)
}

export function eciFromScene(v: Vector3): Vector3 {
  return new Vector3(v.z, v.x, v.y)
}
