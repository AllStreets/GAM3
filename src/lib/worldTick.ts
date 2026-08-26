/**
 * worldTick.ts — Pure, deterministic offline-world advance engine.
 *
 * Called by the /api/tick cron route to advance an offline player's world by
 * the elapsed sim-time. No Math.random, no Date.now, no simNow(), no network,
 * no React/Three. All inputs via args.
 *
 * Reuses existing pure libs:
 *   - applyRaceResult from @/lib/rival
 *   - seedContracts from @/lib/contractsFromBriefing
 *   - fleetReachability from @/lib/reachability
 *   - advanceArc from @/lib/storyProgress
 */

import type { Contract } from '@/state/contractStore'
import type { Satellite } from '@/state/gameStore'
import type { Rival } from '@/lib/rival'
import type { Arc } from '@/lib/storyProgress'
import type { Dispatch } from '@/state/storyStore'
import { applyRaceResult } from '@/lib/rival'
import { seedContracts } from '@/lib/contractsFromBriefing'
import { fleetReachability } from '@/lib/reachability'
import { advanceArc } from '@/lib/storyProgress'

// ─── Public interfaces ───────────────────────────────────────────────────────

export interface WorldDigest {
  /** Sim-time at which this tick was applied. */
  atSim: number
  /** Titles of active contracts that expired (status→failed, −5 rep each). */
  contractsExpired: string[]
  /** Titles of contested contracts the rival claimed (status→failed, −1 rep each). */
  rivalClaimed: string[]
  /** Number of net-new available contracts added to the board this tick. */
  newOffers: number
  /** Short on-brand arc beat line, or null when there are no arcs. */
  arcBeat: string | null
  /** Texts of all dispatches added this tick (rival + story). */
  dispatches: string[]
}

export interface WorldState {
  agency: {
    funding: number
    reputation: number
    leaning?: unknown
    /** Passthrough — unknown agency fields survive unchanged. */
    [k: string]: unknown
  }
  fleet: Satellite[]
  contracts: Contract[]
  story: {
    arcs: Arc[]
    dispatches: Dispatch[]
    rival: Rival
    /** Passthrough — unknown story fields survive unchanged. */
    [k: string]: unknown
  }
}

export interface AdvanceCtx {
  /** Injected sim-time "now" — deterministic, never read from the clock. */
  nowSim: number
  /** World events to seed fresh contracts from. */
  events: {
    id: string
    kind: string
    title: string
    lat: number
    lon: number
    time: string
    severity: number
  }[]
  /** Orbital period in sim-seconds (used for contract deadline calculation). */
  periodSec: number
}

// ─── Arc beat templates ───────────────────────────────────────────────────────

/**
 * Deterministic arc beat lines keyed by tension bracket.
 * Chosen to be on-brand and non-gamifying.
 */
function arcBeatLine(arc: Arc, rivalGained: boolean): string {
  const tension = arc.tension
  if (tension >= 0.85) {
    return rivalGained
      ? `${arc.theme}: pressure peaks — VANTIS has seized the initiative.`
      : `${arc.theme}: the situation demands full operational readiness.`
  }
  if (tension >= 0.55) {
    return rivalGained
      ? `${arc.theme}: rival activity escalates while your fleet held station.`
      : `${arc.theme}: the watch continues; no ground lost.`
  }
  if (tension >= 0.25) {
    return rivalGained
      ? `${arc.theme}: a setback — VANTIS moves faster than anticipated.`
      : `${arc.theme}: steady cadence — orbital coverage holding.`
  }
  return rivalGained
    ? `${arc.theme}: early advantage to VANTIS; time to close the gap.`
    : `${arc.theme}: quiet interval — systems nominal.`
}

/**
 * Deterministic story dispatch text for the periodic tick.
 * Never gamifies real-world events or casualties.
 */
function tickStoryDispatchText(arc: Arc, rivalGained: boolean): string {
  if (rivalGained) {
    return `Mission Control: VANTIS was active while you were offline. Review the board — new taskings are available.`
  }
  const tension = arc.tension
  if (tension >= 0.6) {
    return `Mission Control: Heightened operational tempo. Review your contracts and fleet posture.`
  }
  if (tension >= 0.3) {
    return `Mission Control: Routine status check. Fleet holding assigned coverage windows.`
  }
  return `Mission Control: All systems nominal during your absence. New taskings ready for review.`
}

// ─── advanceWorld ─────────────────────────────────────────────────────────────

/**
 * Advance an offline player's world state by the elapsed sim-time.
 *
 * Pure and deterministic — identical inputs always produce identical outputs.
 * No side effects; returns a new WorldState + WorldDigest.
 */
export function advanceWorld(
  state: WorldState,
  ctx: AdvanceCtx,
): { next: WorldState; digest: WorldDigest } {
  const { nowSim, events, periodSec } = ctx

  // Mutable accumulators (all pure — we build next state, never mutate input)
  let reputation = state.agency.reputation
  const contractsExpired: string[] = []
  const rivalClaimed: string[] = []
  const newDispatchTexts: string[] = []

  let rival = { ...state.story.rival }
  let rivalGainedThisTick = false

  // ── Step 1: Process active contracts ──────────────────────────────────────
  //
  // Rival claim check comes BEFORE expiry: a contested contract where the rival
  // ETA has elapsed is claimed by the rival (soft −1 rep), not expired (−5 rep).
  // This matches the live evaluate() in contractStore.ts where the rival claim
  // branch fires before the deadline-expiry check.

  const processedContracts = state.contracts.map((c): Contract => {
    if (c.status !== 'active') return c

    // Rival claim: contested + ETA elapsed + not completed
    if (c.contested) {
      const rivalEtaAt = c.contested.acceptedAtSec + c.contested.rivalEtaSec
      if (rivalEtaAt < nowSim) {
        // Rival claims this contract
        rival = applyRaceResult(rival, 'rival')
        reputation = Math.max(0, reputation - 1)
        rivalClaimed.push(c.title)
        rivalGainedThisTick = true

        const dispatchText = `${rival.name} reached ${c.title} first. Contract reassigned.`
        newDispatchTexts.push(dispatchText)

        return { ...c, status: 'failed' }
      }
    }

    // Normal expiry: deadline elapsed
    if (c.deadline < nowSim) {
      reputation = Math.max(0, reputation - 5)
      contractsExpired.push(c.title)
      return { ...c, status: 'failed' }
    }

    return c
  })

  // ── Step 2: Drop stale available contracts ─────────────────────────────────
  // Available contracts past their deadline are silently dropped (no rep ding —
  // same as the live evaluate() staleDropped logic).

  // Track how many available contracts exist before pruning (for board cap calc)
  const availableBeforePrune = processedContracts.filter((c) => c.status === 'available').length
  const boardCap = Math.max(2, availableBeforePrune)

  const afterPrune = processedContracts.filter(
    (c) => !(c.status === 'available' && c.deadline < nowSim),
  )

  // ── Step 3: Refresh board ─────────────────────────────────────────────────
  // Top up available contracts from events via seedContracts, filtered to
  // fleet-reachable targets, deduped against existing contracts, capped at boardCap.
  // Never blank: if the board is non-empty, keep it non-empty.

  const existingAvailable = afterPrune.filter((c) => c.status === 'available')
  const spotsRemaining = Math.max(0, boardCap - existingAvailable.length)

  let newOffers = 0
  let refreshed = afterPrune

  if (spotsRemaining > 0 && events.length > 0) {
    // seedContracts expects WorldEvent[] — the AdvanceCtx events shape is compatible
    // (both have id, kind, title, lat, lon, time, severity)
    // We cast here since EventKind is a stricter union but seedContracts handles
    // arbitrary kind strings via archetypeForKind/capabilityForKind fallbacks.
    const seeded = seedContracts(
      events as import('@/lib/worldEvents').WorldEvent[],
      nowSim,
      periodSec,
      state.fleet,
    )

    // Reachability filter: only keep contracts reachable by the fleet
    // seedContracts already does inclination-based filtering, but we also
    // apply fleetReachability to ensure no unreachable contracts slip through.
    const existingIds = new Set(afterPrune.map((c) => c.id))

    const reachableNew = seeded.filter((c) => {
      // Dedup by id
      if (existingIds.has(c.id)) return false
      // Reachability check
      if (state.fleet.length === 0) return true
      const reach = fleetReachability(state.fleet, { lat: c.lat, lon: c.lon })
      return reach.reachable
    })

    const toAdd = reachableNew.slice(0, spotsRemaining)
    newOffers = toAdd.length
    refreshed = [...afterPrune, ...toAdd]
  }

  // ── Step 4: Advance story arc ──────────────────────────────────────────────
  // Advance the first/main arc. escalate = rival gained this tick.

  const arcs = state.story.arcs
  let nextArcs: Arc[]
  let arcBeat: string | null = null

  if (arcs.length === 0) {
    nextArcs = []
    arcBeat = null
  } else {
    const mainArc = arcs[0]
    const advanced = advanceArc(mainArc, rivalGainedThisTick)
    // arcBeat line uses the post-advance arc (reflects new tension)
    arcBeat = arcBeatLine(advanced, rivalGainedThisTick)
    nextArcs = [advanced, ...arcs.slice(1)]
  }

  // ── Step 5: Story dispatch (1 per tick, deterministic, on-brand) ───────────
  const storyDispatchText =
    arcs.length > 0
      ? tickStoryDispatchText(nextArcs[0], rivalGainedThisTick)
      : `Mission Control: Status update. New taskings may be available on the board.`

  newDispatchTexts.push(storyDispatchText)

  const storyDispatch: Dispatch = {
    id: `tick-story-${nowSim}`,
    at: nowSim, // deterministic: use sim-time, not wall clock
    text: storyDispatchText,
    source: 'story',
  }

  // Build rival dispatches from the claim texts already collected
  const rivalDispatchItems: Dispatch[] = rivalClaimed.map((title, idx) => ({
    id: `tick-rival-claim-${nowSim}-${idx}`,
    at: nowSim,
    // The text was already pushed to newDispatchTexts in the right order above
    text: `${rival.name} reached ${title} first. Contract reassigned.`,
    source: 'rival' as const,
  }))

  // Combine: rival dispatches first (fresher news), then story
  const addedDispatches: Dispatch[] = [...rivalDispatchItems, storyDispatch]

  // Prepend to existing dispatches (newest first, mirroring storyStore.addDispatch)
  const MAX_DISPATCHES = 20
  const nextDispatches = [...addedDispatches, ...state.story.dispatches].slice(0, MAX_DISPATCHES)

  // ── Build next state ───────────────────────────────────────────────────────

  const next: WorldState = {
    // Spread agency fields (passthrough unknown fields) then override managed ones
    ...state,
    agency: {
      ...state.agency,
      reputation,
    },
    fleet: state.fleet,
    contracts: refreshed,
    story: {
      // Spread story fields (passthrough unknown fields like lastStoryAt)
      ...state.story,
      arcs: nextArcs,
      dispatches: nextDispatches,
      rival,
    },
  }

  const digest: WorldDigest = {
    atSim: nowSim,
    contractsExpired,
    rivalClaimed,
    newOffers,
    arcBeat,
    dispatches: newDispatchTexts,
  }

  return { next, digest }
}
