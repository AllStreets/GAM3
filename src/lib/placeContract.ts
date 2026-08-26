import type { Contract } from '@/state/contractStore'
import type { Archetype } from '@/lib/archetype'
import type { Capability } from '@/lib/satelliteMeta'
import type { Satellite } from '@/state/gameStore'
import { contractReward, contractDeadline } from '@/lib/economy'
import { archetypeForKind, capabilityForKind } from '@/lib/contractMeta'
import { defaultObjective } from '@/lib/contractObjective'
import { fleetReachability } from '@/lib/reachability'

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
  /** Current satellite fleet — used to annotate reach (not used to filter). */
  sats?: Satellite[]
}

/**
 * Build a deterministic Contract anchored to a map-click position.
 * Pure — no side effects, no store access.
 *
 * The player path is NEVER filtered for reachability — a player can
 * deliberately task a satellite beyond its current coverage. We do annotate
 * `reach` so the UI can show a warning chip.
 */
export function buildPlaceContract(i: PlaceContractInput): Contract {
  const id = `place-${Math.round(i.lat)}-${Math.round(i.lon)}-${Math.round(i.simNow)}`
  const cap = i.preferredCapability ?? capabilityForKind('place')
  const reach = i.sats ? fleetReachability(i.sats, { lat: i.lat, lon: i.lon }) : undefined
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
    preferredCapability: cap,
    gameObjective: defaultObjective('place', cap),
    reach,
  }
}
