import type { Archetype } from '@/lib/archetype'
import type { Capability } from '@/lib/satelliteMeta'

export const CAPABILITY_MATCH_BONUS = 0.35

const has = (k: string, ...w: string[]) => w.some((x) => k.includes(x))

export function archetypeForKind(kind: string): Archetype {
  const k = kind.toLowerCase()
  if (has(k, 'quake', 'seismic', 'flood', 'storm', 'cyclone', 'hurricane', 'typhoon', 'fire', 'wildfire', 'drought')) return 'relief'
  if (has(k, 'launch', 'rocket', 'orbit', 'sat')) return 'defense'
  return 'research' // volcano, ice, anomaly, unknown → observation/science
}

export function capabilityForKind(kind: string): Capability {
  const k = kind.toLowerCase()
  if (has(k, 'fire', 'wildfire', 'volcano', 'thermal', 'heat')) return 'thermal'
  if (has(k, 'launch', 'rocket', 'relay', 'comms')) return 'comms'
  return 'imaging'
}

export function matchBonusFunding(base: number, matched: boolean): number {
  return Math.round(base * (matched ? 1 + CAPABILITY_MATCH_BONUS : 1))
}
