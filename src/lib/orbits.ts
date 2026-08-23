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

function clampUnit(x: number): number {
  return Math.min(1, Math.max(-1, x))
}

export function apoapsis(el: OrbitalElements): number {
  return el.a * (1 + el.e)
}

export function periapsis(el: OrbitalElements): number {
  return el.a * (1 - el.e)
}

/**
 * Classical rv -> elements (ECI). Near-singular cases (equatorial and/or
 * circular) fall back to zeroed angles — fine for gameplay orbits, which are
 * seeded inclined and slightly eccentric.
 */
export function elementsFromState(position: Vector3, velocity: Vector3, t: number): OrbitalElements {
  const EPS = 1e-10
  const r = position.length()
  const v2 = velocity.lengthSq()
  const h = new Vector3().crossVectors(position, velocity)
  const nVec = new Vector3(-h.y, h.x, 0) // z-hat × h
  const rv = position.dot(velocity)

  const eVec = position.clone().multiplyScalar(v2 - MU_EARTH / r)
    .sub(velocity.clone().multiplyScalar(rv))
    .divideScalar(MU_EARTH)
  const e = eVec.length()

  const a = -MU_EARTH / (2 * (v2 / 2 - MU_EARTH / r))
  const i = Math.acos(clampUnit(h.z / h.length()))

  let raan = 0
  if (nVec.length() > EPS) {
    raan = Math.acos(clampUnit(nVec.x / nVec.length()))
    if (nVec.y < 0) raan = TWO_PI - raan
  }

  let argp = 0
  if (nVec.length() > EPS && e > EPS) {
    argp = Math.acos(clampUnit(nVec.dot(eVec) / (nVec.length() * e)))
    if (eVec.z < 0) argp = TWO_PI - argp
  } else if (e > EPS) {
    // equatorial: measure periapsis from +x
    argp = Math.atan2(eVec.y, eVec.x)
    if (h.z < 0) argp = TWO_PI - argp
  }

  // true anomaly
  let nu: number
  if (e > EPS) {
    nu = Math.acos(clampUnit(eVec.dot(position) / (e * r)))
    if (rv < 0) nu = TWO_PI - nu
  } else if (nVec.length() > EPS) {
    nu = Math.acos(clampUnit(nVec.dot(position) / (nVec.length() * r)))
    if (position.z < 0) nu = TWO_PI - nu
  } else {
    nu = Math.atan2(position.y, position.x)
    if (h.z < 0) nu = TWO_PI - nu
  }

  // eccentric anomaly then mean anomaly
  const E = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + Math.cos(nu))
  const m0 = normalizeAngle(E - e * Math.sin(E))

  return { a, e, i, raan, argp, m0, epoch: t }
}

/** Impulsive burn in the RSW-style local frame: prograde = v-hat, normal = h-hat, radial = r-hat. dv in ER/s. */
export function applyDeltaV(
  el: OrbitalElements,
  t: number,
  dv: { prograde: number; normal: number; radial: number },
): OrbitalElements {
  const { position, velocity } = propagate(el, t)
  const vHat = velocity.clone().normalize()
  const hHat = new Vector3().crossVectors(position, velocity).normalize()
  const rHat = position.clone().normalize()
  const newV = velocity.clone()
    .addScaledVector(vHat, dv.prograde)
    .addScaledVector(hHat, dv.normal)
    .addScaledVector(rHat, dv.radial)
  return elementsFromState(position, newV, t)
}

/** Sample the orbit ellipse uniformly in eccentric anomaly. ECI positions. */
export function orbitPathPoints(el: OrbitalElements, segments = 128): Vector3[] {
  const pts: Vector3[] = []
  const sq = Math.sqrt(1 - el.e * el.e)
  for (let k = 0; k < segments; k++) {
    const E = (k / segments) * TWO_PI
    const x = el.a * (Math.cos(E) - el.e)
    const y = el.a * sq * Math.sin(E)
    pts.push(pqwToEci(el, x, y))
  }
  return pts
}
