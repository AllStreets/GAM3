/**
 * coldOpen.ts — pure, deterministic "while you were away" recap.
 *
 * NO clock reads inside this module. The caller passes `nowWallMs`
 * (= Date.now() at call time) so tests can supply any value.
 * Parsing ISO string inputs via new Date(str).getTime() is allowed —
 * that is input deserialization, not reading the system clock.
 */

import { TIME_SCALE } from '@/lib/simTime'

export interface ColdOpenSummary {
  simDaysElapsed: number
  newEventCount: number
  /** Up to 3 event titles, highest severity first. */
  headlineEvents: string[]
  completedWhileAway: number
  expiredWhileAway: number
  /** Deterministic rendered bullet strings for display. */
  lines: string[]
  /** false when lastSeenIso is null/empty — no prior session to compare against. */
  isReturning: boolean
}

export function buildColdOpen(input: {
  /** ISO timestamp of the previous session's lastSeen, or null for a brand-new agency. */
  lastSeenIso: string | null
  /** Wall-clock milliseconds at call time (pass Date.now() from the caller — never read inside). */
  nowWallMs: number
  events: { id: string; title: string; time: string; severity: number }[]
  contracts: { status: string; deadline: number }[]
}): ColdOpenSummary {
  const { lastSeenIso, nowWallMs, events, contracts } = input

  // Brand-new agency or explicit null — nothing to recap.
  if (!lastSeenIso) {
    return {
      simDaysElapsed: 0,
      newEventCount: 0,
      headlineEvents: [],
      completedWhileAway: 0,
      expiredWhileAway: 0,
      lines: [],
      isReturning: false,
    }
  }

  const lastSeenMs = new Date(lastSeenIso).getTime()

  // Guard against bad/future lastSeen values.
  if (!Number.isFinite(lastSeenMs) || lastSeenMs >= nowWallMs) {
    return {
      simDaysElapsed: 0,
      newEventCount: 0,
      headlineEvents: [],
      completedWhileAway: 0,
      expiredWhileAway: 0,
      lines: [],
      isReturning: true,
    }
  }

  // Sim-days: wall-seconds elapsed × TIME_SCALE / 86400.
  const wallSecondsElapsed = (nowWallMs - lastSeenMs) / 1000
  const simDaysElapsed = Math.floor((wallSecondsElapsed * TIME_SCALE) / 86400)

  // New events since lastSeen (compare ISO strings lexicographically — valid for ISO 8601).
  const newEvents = events.filter((e) => e.time > lastSeenIso)
  const newEventCount = newEvents.length

  // Headline events: top 3 by severity, descending.
  const headlineEvents = [...newEvents]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3)
    .map((e) => e.title)

  // Contract tallies — simplest deterministic approach: count by status.
  const completedWhileAway = contracts.filter((c) => c.status === 'completed').length
  const expiredWhileAway = contracts.filter((c) => c.status === 'failed').length

  // Build on-brand bullet lines — only include lines where count > 0.
  // Always include the sim-days line when returning.
  const lines: string[] = []

  const simDaysStr =
    simDaysElapsed === 1
      ? '1 sim-day elapsed'
      : `${simDaysElapsed} sim-days elapsed`
  lines.push(`WHILE YOU WERE AWAY — ${simDaysStr}`)

  if (newEventCount > 0) {
    lines.push(
      `${newEventCount} new ${newEventCount === 1 ? 'event' : 'events'} flagged by global sensors`,
    )
  }

  if (completedWhileAway > 0) {
    lines.push(
      `HYPERION fleet logged ${completedWhileAway} completed ${completedWhileAway === 1 ? 'tasking' : 'taskings'}`,
    )
  }

  if (expiredWhileAway > 0) {
    lines.push(
      `${expiredWhileAway} ${expiredWhileAway === 1 ? 'contract' : 'contracts'} expired without fulfilment`,
    )
  }

  return {
    simDaysElapsed,
    newEventCount,
    headlineEvents,
    completedWhileAway,
    expiredWhileAway,
    lines,
    isReturning: true,
  }
}
