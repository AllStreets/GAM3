import type { Contract } from '@/state/contractStore'
import type { Archetype } from '@/lib/archetype'
import type { Capability } from '@/lib/satelliteMeta'
import { contractReward, contractDeadline } from '@/lib/economy'
import { archetypeForKind, capabilityForKind } from '@/lib/contractMeta'

export interface PlaceContractInput {
  lat: number
  lon: number
  placeName: string
  title?: string
  objective?: string
  archetype?: Archetype
  preferredCapability?: Capability
  severity?: number
  simNow: number
  periodSec: number
}

/**
 * Build a deterministic Contract anchored to a map-click position.
 * Pure — no side effects, no store access.
 */
export function buildPlaceContract(i: PlaceContractInput): Contract {
  const id = `place-${Math.round(i.lat)}-${Math.round(i.lon)}-${Math.round(i.simNow)}`
  return {
    id,
    eventId: id,
    title: i.title ?? `${i.placeName} — Observation Tasking`,
    ...(i.objective ? { objective: i.objective } : {}),
    kind: 'place',
    lat: i.lat,
    lon: i.lon,
    deadline: contractDeadline(i.simNow, i.periodSec),
    reward: contractReward(i.severity ?? 0.5),
    status: 'available',
    archetype: i.archetype ?? archetypeForKind('place'),
    preferredCapability: i.preferredCapability ?? capabilityForKind('place'),
  }
}
