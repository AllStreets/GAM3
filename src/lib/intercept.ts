import { propagate, sceneFromEci, type OrbitalElements } from './orbits'
import { vector3ToLatLon, greatCircleKm } from './geo'

/** Imaging swath: a pass within this ground distance of the target completes a contract. */
export const COMPLETION_RADIUS_KM = 500

export interface GeoTarget {
  lat: number
  lon: number
}

/** Ground point directly beneath the satellite at sim time t. */
export function subPoint(el: OrbitalElements, t: number): { lat: number; lon: number } {
  const scene = sceneFromEci(propagate(el, t).position)
  return vector3ToLatLon(scene)
}

/** Great-circle km from the satellite's sub-point to the target at time t. */
export function groundDistanceKm(el: OrbitalElements, t: number, target: GeoTarget): number {
  const sp = subPoint(el, t)
  return greatCircleKm(sp.lat, sp.lon, target.lat, target.lon)
}

/** Minimum ground distance to the target over [fromT, fromT+windowSec] and the offset where it occurs. */
export function closestApproach(
  el: OrbitalElements,
  target: GeoTarget,
  fromT: number,
  windowSec: number,
  stepSec = Math.max(5, windowSec / 400),
): { closestKm: number; etaSec: number } {
  let closestKm = Infinity
  let etaSec = 0
  for (let t = fromT; t <= fromT + windowSec; t += stepSec) {
    const d = groundDistanceKm(el, t, target)
    if (d < closestKm) {
      closestKm = d
      etaSec = t - fromT
    }
  }
  return { closestKm, etaSec }
}
