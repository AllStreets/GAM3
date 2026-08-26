import { describe, it, expect } from 'vitest'
import { buildColdOpen, digestLines } from './coldOpen'
import { TIME_SCALE } from './simTime'
import type { WorldDigest } from './worldTick'

// Fixed wall clock value used across tests — avoids any real Date.now() calls.
const NOW_WALL_MS = new Date('2026-06-15T12:00:00Z').getTime()
// 2 wall-hours before NOW_WALL_MS.
const LAST_SEEN_2H_AGO = new Date(NOW_WALL_MS - 2 * 3600 * 1000).toISOString()
// Expected sim-days for 2 wall-hours: floor((7200 * TIME_SCALE) / 86400)
const EXPECTED_SIM_DAYS_2H = Math.floor((7200 * TIME_SCALE) / 86400)

const BASE_EVENTS = [
  { id: 'e1', title: 'Major Quake Alpha', time: '2026-06-15T11:30:00Z', severity: 0.9 },
  { id: 'e2', title: 'Wildfire Beta',     time: '2026-06-15T11:45:00Z', severity: 0.5 },
  { id: 'e3', title: 'Storm Gamma',       time: '2026-06-15T10:30:00Z', severity: 0.7 },
  { id: 'e4', title: 'Old Event Delta',   time: '2026-06-14T06:00:00Z', severity: 0.8 },
]

const BASE_CONTRACTS = [
  { status: 'completed', deadline: 9999 },
  { status: 'completed', deadline: 9999 },
  { status: 'failed',    deadline: 1000 },
  { status: 'active',    deadline: 9999 },
  { status: 'available', deadline: 9999 },
]

describe('buildColdOpen', () => {
  describe('null / empty lastSeenIso', () => {
    it('returns isReturning=false with zeros when lastSeenIso is null', () => {
      const r = buildColdOpen({ lastSeenIso: null, nowWallMs: NOW_WALL_MS, events: BASE_EVENTS, contracts: BASE_CONTRACTS })
      expect(r.isReturning).toBe(false)
      expect(r.simDaysElapsed).toBe(0)
      expect(r.newEventCount).toBe(0)
      expect(r.headlineEvents).toEqual([])
      expect(r.completedWhileAway).toBe(0)
      expect(r.expiredWhileAway).toBe(0)
      expect(r.lines).toEqual([])
    })

    it('returns isReturning=false with zeros when lastSeenIso is empty string', () => {
      const r = buildColdOpen({ lastSeenIso: '', nowWallMs: NOW_WALL_MS, events: [], contracts: [] })
      expect(r.isReturning).toBe(false)
      expect(r.lines).toEqual([])
    })
  })

  describe('simDaysElapsed', () => {
    it('computes positive simDaysElapsed from a past lastSeen', () => {
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: [], contracts: [] })
      expect(r.isReturning).toBe(true)
      expect(r.simDaysElapsed).toBe(EXPECTED_SIM_DAYS_2H)
      expect(r.simDaysElapsed).toBeGreaterThan(0)
    })

    it('uses TIME_SCALE to compress wall time into sim time', () => {
      // 1 wall-day should yield TIME_SCALE sim-days.
      const oneDayMs = 24 * 3600 * 1000
      const r = buildColdOpen({
        lastSeenIso: new Date(NOW_WALL_MS - oneDayMs).toISOString(),
        nowWallMs: NOW_WALL_MS,
        events: [],
        contracts: [],
      })
      expect(r.simDaysElapsed).toBe(TIME_SCALE) // 1 wall-day × TIME_SCALE / 1 = TIME_SCALE sim-days
    })

    it('floors to integer sim-days', () => {
      // Very short absence — less than one sim-day.
      const shortAbsenceMs = 1000 // 1 wall-second = TIME_SCALE sim-seconds < 1 sim-day
      const r = buildColdOpen({
        lastSeenIso: new Date(NOW_WALL_MS - shortAbsenceMs).toISOString(),
        nowWallMs: NOW_WALL_MS,
        events: [],
        contracts: [],
      })
      expect(r.simDaysElapsed).toBe(0)
    })

    it('returns zeros (not negative) when lastSeen is in the future relative to now', () => {
      const futureIso = new Date(NOW_WALL_MS + 1000).toISOString()
      const r = buildColdOpen({ lastSeenIso: futureIso, nowWallMs: NOW_WALL_MS, events: [], contracts: [] })
      expect(r.isReturning).toBe(true)
      expect(r.simDaysElapsed).toBe(0)
    })
  })

  describe('event counting and headlines', () => {
    it('counts only events whose time is after lastSeenIso', () => {
      // LAST_SEEN_2H_AGO = 2026-06-15T10:00:00Z
      // e1 (11:30), e2 (11:45), e3 (10:30) are after; e4 (2026-06-14) is before.
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: BASE_EVENTS, contracts: [] })
      expect(r.newEventCount).toBe(3) // e1, e2, e3
    })

    it('counts zero new events when all events predate lastSeen', () => {
      const recentLastSeen = new Date(NOW_WALL_MS - 60 * 1000).toISOString() // 1 minute ago
      const r = buildColdOpen({ lastSeenIso: recentLastSeen, nowWallMs: NOW_WALL_MS, events: BASE_EVENTS, contracts: [] })
      expect(r.newEventCount).toBe(0)
    })

    it('sorts headlineEvents by severity descending and caps at 3', () => {
      const manyEvents = [
        { id: 'a', title: 'Low',    time: '2026-06-15T11:00:00Z', severity: 0.1 },
        { id: 'b', title: 'High',   time: '2026-06-15T11:00:00Z', severity: 0.9 },
        { id: 'c', title: 'Med',    time: '2026-06-15T11:00:00Z', severity: 0.5 },
        { id: 'd', title: 'VHigh',  time: '2026-06-15T11:00:00Z', severity: 0.95 },
        { id: 'e', title: 'MedLow', time: '2026-06-15T11:00:00Z', severity: 0.3 },
      ]
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: manyEvents, contracts: [] })
      expect(r.headlineEvents).toHaveLength(3)
      expect(r.headlineEvents[0]).toBe('VHigh')
      expect(r.headlineEvents[1]).toBe('High')
      expect(r.headlineEvents[2]).toBe('Med')
    })

    it('headlineEvents has fewer than 3 entries when fewer new events exist', () => {
      const oneEvent = [{ id: 'x', title: 'Solo', time: '2026-06-15T11:00:00Z', severity: 0.6 }]
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: oneEvent, contracts: [] })
      expect(r.headlineEvents).toHaveLength(1)
      expect(r.headlineEvents[0]).toBe('Solo')
    })
  })

  describe('contract tallies', () => {
    it('tallies completed contracts', () => {
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: [], contracts: BASE_CONTRACTS })
      expect(r.completedWhileAway).toBe(2)
    })

    it('tallies failed contracts as expired', () => {
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: [], contracts: BASE_CONTRACTS })
      expect(r.expiredWhileAway).toBe(1)
    })

    it('ignores active/available contracts in tallies', () => {
      const onlyActive = [
        { status: 'active', deadline: 9999 },
        { status: 'available', deadline: 9999 },
      ]
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: [], contracts: onlyActive })
      expect(r.completedWhileAway).toBe(0)
      expect(r.expiredWhileAway).toBe(0)
    })
  })

  describe('lines', () => {
    it('lines is non-empty and deterministic when returning', () => {
      const r1 = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: BASE_EVENTS, contracts: BASE_CONTRACTS })
      const r2 = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: BASE_EVENTS, contracts: BASE_CONTRACTS })
      expect(r1.lines.length).toBeGreaterThan(0)
      expect(r1.lines).toEqual(r2.lines)
    })

    it('always includes sim-days line when returning', () => {
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: [], contracts: [] })
      expect(r.lines.some((l) => l.includes('sim-day'))).toBe(true)
    })

    it('omits event/contract lines when counts are zero', () => {
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: [], contracts: [] })
      expect(r.lines).toHaveLength(1) // only the sim-days line
      expect(r.lines[0]).toContain('sim-day')
    })

    it('includes event line when there are new events', () => {
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: BASE_EVENTS, contracts: [] })
      expect(r.lines.some((l) => l.includes('event'))).toBe(true)
    })

    it('includes completed tasking line when completedWhileAway > 0', () => {
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: [], contracts: BASE_CONTRACTS })
      expect(r.lines.some((l) => l.includes('completed'))).toBe(true)
    })

    it('includes expired line when expiredWhileAway > 0', () => {
      const r = buildColdOpen({ lastSeenIso: LAST_SEEN_2H_AGO, nowWallMs: NOW_WALL_MS, events: [], contracts: BASE_CONTRACTS })
      expect(r.lines.some((l) => l.includes('expired'))).toBe(true)
    })

    it('lines is empty when isReturning is false', () => {
      const r = buildColdOpen({ lastSeenIso: null, nowWallMs: NOW_WALL_MS, events: BASE_EVENTS, contracts: BASE_CONTRACTS })
      expect(r.lines).toEqual([])
    })
  })
})

// ─── digestLines ─────────────────────────────────────────────────────────────

const BASE_DIGEST: WorldDigest = {
  atSim: 100_000,
  contractsExpired: [],
  rivalClaimed: [],
  newOffers: 0,
  arcBeat: null,
  dispatches: [],
}

describe('digestLines', () => {
  it('returns empty array for a fully empty digest', () => {
    expect(digestLines(BASE_DIGEST)).toEqual([])
  })

  it('includes one line per rivalClaimed entry', () => {
    const d: WorldDigest = { ...BASE_DIGEST, rivalClaimed: ['Ende Aftershock Watch', 'Flood Zone Delta'] }
    const lines = digestLines(d)
    expect(lines.some((l) => l.includes('Ende Aftershock Watch'))).toBe(true)
    expect(lines.some((l) => l.includes('Flood Zone Delta'))).toBe(true)
    expect(lines.filter((l) => l.includes('claimed') || l.includes('VANTIS'))).toHaveLength(2)
  })

  it('includes a summary line for expired contracts', () => {
    const d: WorldDigest = { ...BASE_DIGEST, contractsExpired: ['Alpha', 'Beta', 'Gamma'] }
    const lines = digestLines(d)
    expect(lines.some((l) => l.includes('3') && l.includes('expired'))).toBe(true)
  })

  it('uses singular "tasking" for a single expiry', () => {
    const d: WorldDigest = { ...BASE_DIGEST, contractsExpired: ['Solo Tasking'] }
    const lines = digestLines(d)
    const expiredLine = lines.find((l) => l.includes('expired'))
    expect(expiredLine).toBeDefined()
    expect(expiredLine).toMatch(/1 tasking expired/)
  })

  it('includes a new-offers line when newOffers > 0', () => {
    const d: WorldDigest = { ...BASE_DIGEST, newOffers: 4 }
    const lines = digestLines(d)
    expect(lines.some((l) => l.includes('4') && l.includes('contract'))).toBe(true)
  })

  it('uses singular "contract" for newOffers === 1', () => {
    const d: WorldDigest = { ...BASE_DIGEST, newOffers: 1 }
    const lines = digestLines(d)
    expect(lines.some((l) => l.match(/1 new contract/))).toBe(true)
  })

  it('includes the arcBeat line when present', () => {
    const d: WorldDigest = { ...BASE_DIGEST, arcBeat: 'SENTINEL: the watch continues; no ground lost.' }
    const lines = digestLines(d)
    expect(lines.some((l) => l.includes('SENTINEL'))).toBe(true)
  })

  it('omits arcBeat line when null', () => {
    const d: WorldDigest = { ...BASE_DIGEST, arcBeat: null }
    const lines = digestLines(d)
    expect(lines).toHaveLength(0)
  })

  it('is deterministic — same input always same output', () => {
    const d: WorldDigest = {
      atSim: 200_000,
      contractsExpired: ['A', 'B'],
      rivalClaimed: ['C'],
      newOffers: 3,
      arcBeat: 'SENTINEL: escalating.',
      dispatches: ['some dispatch'],
    }
    expect(digestLines(d)).toEqual(digestLines(d))
    expect(digestLines(d)).toEqual(digestLines({ ...d }))
  })

  it('full digest produces lines in correct order: rival → expired → offers → arc', () => {
    const d: WorldDigest = {
      atSim: 300_000,
      contractsExpired: ['Exp1'],
      rivalClaimed: ['Claim1'],
      newOffers: 2,
      arcBeat: 'ARC BEAT LINE',
      dispatches: [],
    }
    const lines = digestLines(d)
    const claimIdx = lines.findIndex((l) => l.includes('Claim1'))
    const expiredIdx = lines.findIndex((l) => l.includes('expired'))
    const offersIdx = lines.findIndex((l) => l.includes('contract'))
    const arcIdx = lines.findIndex((l) => l.includes('ARC BEAT LINE'))
    expect(claimIdx).toBeLessThan(expiredIdx)
    expect(expiredIdx).toBeLessThan(offersIdx)
    expect(offersIdx).toBeLessThan(arcIdx)
  })
})
