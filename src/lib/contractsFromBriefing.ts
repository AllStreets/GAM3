import type { Contract } from '@/state/contractStore'
import type { WorldEvent } from '@/lib/worldEvents'
import type { Archetype } from '@/lib/archetype'
import type { Capability } from '@/lib/satelliteMeta'
import type { Satellite } from '@/state/gameStore'
import { contractReward, contractDeadline } from '@/lib/economy'
import { archetypeForKind, capabilityForKind } from '@/lib/contractMeta'
import { defaultObjective } from '@/lib/contractObjective'
import { fleetReachability, isTargetReachable } from '@/lib/reachability'

export interface BriefingMission {
  title: string
  eventId: string
  objective: string
  /** Proposed by the AI — engine still sets reward/deadline from event kind. */
  archetype?: Archetype
  preferredCapability?: Capability
}

function contractForEvent(
  title: string,
  ev: WorldEvent,
  simNow: number,
  periodSec: number,
  sats: Satellite[],
  missionArchetype?: Archetype,
  missionCapability?: Capability,
): Contract {
  const arch = missionArchetype ?? archetypeForKind(ev.kind)
  const cap = missionCapability ?? capabilityForKind(ev.kind)
  const reach = fleetReachability(sats, { lat: ev.lat, lon: ev.lon })
  return {
    id: `contract-${ev.id}`,
    eventId: ev.id,
    title,
    kind: ev.kind,
    lat: ev.lat,
    lon: ev.lon,
    deadline: contractDeadline(simNow, periodSec),
    reward: contractReward(ev.severity),
    status: 'available',
    // Use the mission's AI-proposed values when present; fall back to kind derivation
    archetype: arch,
    preferredCapability: cap,
    gameObjective: defaultObjective(ev.kind, cap),
    reach,
  }
}

/** One contract per briefing mission that references a known event.
 *
 * Filters out contracts whose target latitude is unreachable by the current
 * fleet (inclination-based check). Player-created contracts are NOT filtered
 * (those come through `buildPlaceContract` / `placeContract.ts`).
 *
 * Never-blank rule: caller is responsible for falling back to `seedContracts`
 * when this returns an empty array.
 */
export function contractsFromBriefing(
  missions: BriefingMission[],
  events: WorldEvent[],
  simNow: number,
  periodSec: number,
  sats: Satellite[] = [],
): Contract[] {
  const byId = new Map(events.map((e) => [e.id, e]))
  const out: Contract[] = []
  for (const m of missions) {
    const ev = byId.get(m.eventId)
    if (!ev) continue
    // Filter: skip events no satellite can physically reach.
    if (sats.length > 0 && !sats.some((s) => isTargetReachable(s.elements, ev.lat))) continue
    out.push(contractForEvent(m.title, ev, simNow, periodSec, sats, m.archetype, m.preferredCapability))
  }
  return out
}

/** Deterministic fallback so the board is never empty: top-2 events by severity
 * that the fleet can physically reach. If no reachable events exist (degenerate
 * fleet), falls back to the top-2 regardless (better than a blank board).
 */
export function seedContracts(
  events: WorldEvent[],
  simNow: number,
  periodSec: number,
  sats: Satellite[] = [],
): Contract[] {
  const sorted = [...events].sort((a, b) => b.severity - a.severity)
  // Prefer reachable events; only fall back to all events if fleet is empty or
  // no reachable events exist.
  const reachable = sats.length > 0
    ? sorted.filter((ev) => sats.some((s) => isTargetReachable(s.elements, ev.lat)))
    : sorted
  const pool = reachable.length > 0 ? reachable : sorted
  return pool
    .slice(0, 2)
    .map((ev) => contractForEvent(`Priority Watch — ${ev.title}`, ev, simNow, periodSec, sats))
}
