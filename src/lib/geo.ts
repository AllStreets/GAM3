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
  if (lon > 180) lon -= 360
  if (lon < -180) lon += 360

  return { lat, lon }
}
