import { closestApproach } from '@/lib/intercept'
import type { OrbitalElements } from '@/lib/orbits'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export interface ManeuverScore {
  efficiency: number
  precision: number
  grade: 'S' | 'A' | 'B' | 'C'
  overall: number
}

export function scoreManeuver(input: {
  dvNeeded: number
  dvSpent: number
  closestKm: number
  radiusKm: number
}): ManeuverScore {
  const efficiency = clamp01(input.dvNeeded / Math.max(input.dvSpent, 1e-6))
  const precision = clamp01(1 - input.closestKm / Math.max(input.radiusKm, 1e-6))
  const overall = 0.5 * efficiency + 0.5 * precision
  const grade: 'S' | 'A' | 'B' | 'C' =
    overall >= 0.9 ? 'S' : overall >= 0.75 ? 'A' : overall >= 0.5 ? 'B' : 'C'
  return { efficiency, precision, grade, overall }
}

export function detectTrickShot(input: {
  elements: OrbitalElements
  targets: { lat: number; lon: number }[]
  fromT: number
  windowSec: number
  radiusKm: number
}): { count: number; isTrickShot: boolean } {
  const count = input.targets.reduce((n, t) => {
    const { closestKm } = closestApproach(input.elements, t, input.fromT, input.windowSec)
    return n + (closestKm <= input.radiusKm ? 1 : 0)
  }, 0)
  return { count, isTrickShot: count >= 2 }
}
