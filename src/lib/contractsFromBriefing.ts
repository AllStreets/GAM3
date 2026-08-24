import type { Contract } from '@/state/contractStore'
import type { WorldEvent } from '@/lib/worldEvents'
import { contractReward, contractDeadline } from '@/lib/economy'
import { archetypeForKind, capabilityForKind } from '@/lib/contractMeta'

export interface BriefingMission {
  title: string
  eventId: string
  objective: string
}

function contractForEvent(title: string, ev: WorldEvent, simNow: number, periodSec: number): Contract {
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
    archetype: archetypeForKind(ev.kind),
    preferredCapability: capabilityForKind(ev.kind),
  }
}

/** One contract per briefing mission that references a known event. */
export function contractsFromBriefing(
  missions: BriefingMission[],
  events: WorldEvent[],
  simNow: number,
  periodSec: number,
): Contract[] {
  const byId = new Map(events.map((e) => [e.id, e]))
  const out: Contract[] = []
  for (const m of missions) {
    const ev = byId.get(m.eventId)
    if (ev) out.push(contractForEvent(m.title, ev, simNow, periodSec))
  }
  return out
}

/** Deterministic fallback so the board is never empty: top-2 events by severity. */
export function seedContracts(events: WorldEvent[], simNow: number, periodSec: number): Contract[] {
  return [...events]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 2)
    .map((ev) => contractForEvent(`Priority Watch — ${ev.title}`, ev, simNow, periodSec))
}
