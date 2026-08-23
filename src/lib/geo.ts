import { Vector3 } from 'three'

/** Scene-space Earth radius. All distances in the app are in Earth radii. */
export const EARTH_RADIUS = 1

const DEG = Math.PI / 180

/**
 * Geographic coordinates -> scene position, matching the equirectangular
 * UV layout of THREE.SphereGeometry (three-globe convention):
 * phi = (90 - lat), theta = (90 - lon).
 */
export function latLonToVector3(
  latDeg: number,
  lonDeg: number,
  radius: number = EARTH_RADIUS,
): Vector3 {
  const phi = (90 - latDeg) * DEG
  const theta = (90 - lonDeg) * DEG
  return new Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

/**
 * Approximate subsolar point (where the sun is directly overhead).
 * Declination: cosine approximation, accurate to ~1°.
 * Longitude: from the UTC hour angle (ignores equation of time, error < 4°) —
 * plenty for a game terminator.
 */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1)
  const dayOfYear = (date.getTime() - startOfYear) / 86_400_000 + 1
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365.24) * (dayOfYear + 10))

  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  let lon = (12 - utcHours) * 15
  // Result is in (-180, 180]: exactly 180 (00:00 UTC) is NOT wrapped to -180 — same meridian.
  if (lon > 180) lon -= 360
  if (lon < -180) lon += 360

  return { lat, lon }
}

/** Earth radius in km (surface-distance conversions). */
export const ER_KM = 6371

/** Inverse of latLonToVector3. lon returned in (-180, 180]. */
export function vector3ToLatLon(v: Vector3): { lat: number; lon: number } {
  const n = v.clone().normalize()
  const lat = 90 - (Math.acos(Math.min(1, Math.max(-1, n.y))) * 180) / Math.PI
  let lon = 90 - (Math.atan2(n.z, n.x) * 180) / Math.PI
  if (lon > 180) lon -= 360
  if (lon <= -180) lon += 360
  return { lat, lon }
}

/** Haversine great-circle surface distance in km. */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * ER_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}
