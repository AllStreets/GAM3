import { describe, it, expect } from 'vitest'
import { contractsFromBriefing, seedContracts } from './contractsFromBriefing'
import type { WorldEvent } from './worldEvents'

const ev = (id: string, severity = 0.5): WorldEvent => ({
  id, kind: 'quake', title: `Event ${id}`, lat: 10, lon: 20, time: '2026-08-23T00:00:00Z', severity,
})

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
    expect(cs[0].deadline).toBe(1000 + 3 * 5400)
    expect(cs[0].reward.funding).toBeGreaterThan(0)
    expect(cs[0].status).toBe('available')
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
})
