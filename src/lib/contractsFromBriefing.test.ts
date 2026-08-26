import { describe, it, expect } from 'vitest'
import { contractsFromBriefing, seedContracts } from './contractsFromBriefing'
import type { WorldEvent } from './worldEvents'
import type { Satellite } from '@/state/gameStore'

const deg = (d: number) => (d * Math.PI) / 180

const ev = (id: string, severity = 0.5, lat = 10, lon = 20): WorldEvent => ({
  id, kind: 'quake', title: `Event ${id}`, lat, lon, time: '2026-08-23T00:00:00Z', severity,
})

/** ISS-like satellite: inclination 51.6° — reaches up to ~56° latitude */
const issSat: Satellite = {
  id: 'hyp-1', name: 'HYPERION-1',
  elements: { a: (6371 + 420) / 6371, e: 0.0012, i: deg(51.6), raan: 0.8, argp: 0.3, m0: 0, epoch: 0 },
  fuel: 1800, fuelCapacity: 1800,
  capability: 'imaging',
  record: { contractsCompleted: 0, notablePasses: [], commissionedAt: 0 },
  tankLevel: 0,
}

/** Polar satellite: inclination 97.5° — reaches ~87° latitude */
const polarSat: Satellite = {
  id: 'hyp-2', name: 'HYPERION-2',
  elements: { a: (6371 + 780) / 6371, e: 0.002, i: deg(97.5), raan: 2.4, argp: 1.1, m0: 2.0, epoch: 0 },
  fuel: 1500, fuelCapacity: 1500,
  capability: 'imaging',
  record: { contractsCompleted: 0, notablePasses: [], commissionedAt: 0 },
  tankLevel: 0,
}

describe('contractsFromBriefing', () => {
  it('builds a contract per mission with a matching event', () => {
    const cs = contractsFromBriefing(
      [{ title: 'Survey', eventId: 'a', objective: '...' }, { title: 'Nope', eventId: 'zzz', objective: '...' }],
      [ev('a')],
      1000, 5400,
    )
    expect(cs).toHaveLength(1)
    expect(cs[0].eventId).toBe('a')
    expect(cs[0].lat).toBe(10)
    expect(cs[0].deadline).toBe(1000 + 5 * 5400)
    expect(cs[0].reward.funding).toBeGreaterThan(0)
    expect(cs[0].status).toBe('available')
  })

  it('annotates contracts with reach info when sats are provided', () => {
    const cs = contractsFromBriefing(
      [{ title: 'Survey', eventId: 'a', objective: '...' }],
      [ev('a', 0.5, 10, 20)],
      1000, 5400,
      [issSat],
    )
    expect(cs).toHaveLength(1)
    expect(cs[0].reach).toBeDefined()
    expect(cs[0].reach!.reachable).toBe(true)
  })

  it('filters out events at latitudes no satellite can reach (80°N vs ISS)', () => {
    const arcticEv = ev('arctic', 0.9, 80, 0) // 80°N — beyond 51.6° ISS
    const cs = contractsFromBriefing(
      [{ title: 'Arctic Watch', eventId: 'arctic', objective: '...' }],
      [arcticEv],
      1000, 5400,
      [issSat],
    )
    expect(cs).toHaveLength(0)
  })

  it('keeps events reachable by at least one satellite in a mixed fleet', () => {
    const arcticEv = ev('arctic', 0.9, 80, 0) // 80°N — polar sat can reach, ISS cannot
    const cs = contractsFromBriefing(
      [{ title: 'Arctic Watch', eventId: 'arctic', objective: '...' }],
      [arcticEv],
      1000, 5400,
      [issSat, polarSat],
    )
    expect(cs).toHaveLength(1)
    expect(cs[0].reach!.reachable).toBe(true)
  })

  it('does not filter when no sats provided (backward compat)', () => {
    const arcticEv = ev('arctic', 0.9, 80, 0)
    const cs = contractsFromBriefing(
      [{ title: 'Arctic Watch', eventId: 'arctic', objective: '...' }],
      [arcticEv],
      1000, 5400,
      // no sats — defaults to []
    )
    expect(cs).toHaveLength(1) // not filtered
  })
})

describe('seedContracts', () => {
  it('returns up to two contracts from the highest-severity events', () => {
    const cs = seedContracts([ev('a', 0.2), ev('b', 0.9), ev('c', 0.5)], 0, 5400)
    expect(cs).toHaveLength(2)
    expect(cs[0].eventId).toBe('b') // highest severity first
  })
  it('is empty when there are no events', () => {
    expect(seedContracts([], 0, 5400)).toEqual([])
  })
  it('filters to reachable events when sats provided', () => {
    // 80°N event: only polar sat reaches it
    const arcticEv = ev('arctic', 0.9, 80, 0)
    const equatorialEv = ev('eq', 0.5, 5, 0)
    const cs = seedContracts([arcticEv, equatorialEv], 0, 5400, [issSat])
    // arcticEv is unreachable by ISS; only equatorialEv should be seeded
    expect(cs.every((c) => c.lat !== 80)).toBe(true)
    expect(cs.some((c) => c.eventId === 'eq')).toBe(true)
  })
  it('falls back to all events when none reachable (never-blank)', () => {
    // Artificially: no satellites, no filtering → fall back to all events
    const arcticEv = ev('arctic', 0.9, 80, 0)
    const cs = seedContracts([arcticEv], 0, 5400, [])
    expect(cs).toHaveLength(1) // always returns something if events exist
  })
})
