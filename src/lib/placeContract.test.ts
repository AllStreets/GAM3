import { describe, it, expect } from 'vitest'
import { buildPlaceContract } from './placeContract'
import { contractReward, contractDeadline } from './economy'
import { archetypeForKind, capabilityForKind } from './contractMeta'

const BASE_SIM_NOW = 1_000_000
const PERIOD = 5_400

describe('buildPlaceContract', () => {
  it('sets target lat/lon exactly from input', () => {
    const c = buildPlaceContract({
      lat: 48.8566,
      lon: 2.3522,
      placeName: 'Paris',
      simNow: BASE_SIM_NOW,
      periodSec: PERIOD,
    })
    expect(c.lat).toBe(48.8566)
    expect(c.lon).toBe(2.3522)
  })

  it('produces a deterministic id from rounded lat/lon/simNow', () => {
    const c1 = buildPlaceContract({ lat: 48.8566, lon: 2.3522, placeName: 'Paris', simNow: BASE_SIM_NOW, periodSec: PERIOD })
    const c2 = buildPlaceContract({ lat: 48.8566, lon: 2.3522, placeName: 'Somewhere', simNow: BASE_SIM_NOW, periodSec: PERIOD })
    // Same coords + simNow → same id
    expect(c1.id).toBe(c2.id)
    // id includes rounded values
    expect(c1.id).toBe(`place-${Math.round(48.8566)}-${Math.round(2.3522)}-${Math.round(BASE_SIM_NOW)}`)
    // eventId mirrors id
    expect(c1.eventId).toBe(c1.id)
  })

  it('different simNow produces different id', () => {
    const c1 = buildPlaceContract({ lat: 0, lon: 0, placeName: 'A', simNow: 100, periodSec: PERIOD })
    const c2 = buildPlaceContract({ lat: 0, lon: 0, placeName: 'A', simNow: 200_000, periodSec: PERIOD })
    expect(c1.id).not.toBe(c2.id)
  })

  it('sets kind to "place"', () => {
    const c = buildPlaceContract({ lat: 0, lon: 0, placeName: 'X', simNow: BASE_SIM_NOW, periodSec: PERIOD })
    expect(c.kind).toBe('place')
  })

  it('sets status to "available"', () => {
    const c = buildPlaceContract({ lat: 0, lon: 0, placeName: 'X', simNow: BASE_SIM_NOW, periodSec: PERIOD })
    expect(c.status).toBe('available')
  })

  it('computes reward from severity via contractReward', () => {
    const c = buildPlaceContract({ lat: 0, lon: 0, placeName: 'X', simNow: BASE_SIM_NOW, periodSec: PERIOD, severity: 0.8 })
    expect(c.reward).toEqual(contractReward(0.8))
  })

  it('uses 0.5 as default severity when not supplied', () => {
    const c = buildPlaceContract({ lat: 0, lon: 0, placeName: 'X', simNow: BASE_SIM_NOW, periodSec: PERIOD })
    expect(c.reward).toEqual(contractReward(0.5))
  })

  it('computes deadline from contractDeadline', () => {
    const c = buildPlaceContract({ lat: 0, lon: 0, placeName: 'X', simNow: BASE_SIM_NOW, periodSec: PERIOD })
    expect(c.deadline).toBe(contractDeadline(BASE_SIM_NOW, PERIOD))
  })

  it('honours explicit archetype and preferredCapability', () => {
    const c = buildPlaceContract({
      lat: 0, lon: 0, placeName: 'X', simNow: BASE_SIM_NOW, periodSec: PERIOD,
      archetype: 'defense',
      preferredCapability: 'thermal',
    })
    expect(c.archetype).toBe('defense')
    expect(c.preferredCapability).toBe('thermal')
  })

  it('defaults archetype and preferredCapability via contractMeta when not supplied', () => {
    const c = buildPlaceContract({ lat: 0, lon: 0, placeName: 'X', simNow: BASE_SIM_NOW, periodSec: PERIOD })
    // With no kind context, should match archetypeForKind('place') or 'research' fallback
    expect(['relief', 'research', 'defense']).toContain(c.archetype)
    expect(['imaging', 'comms', 'thermal']).toContain(c.preferredCapability)
  })

  it('uses default archetype from contractMeta for neutral kind', () => {
    const c = buildPlaceContract({ lat: 0, lon: 0, placeName: 'X', simNow: BASE_SIM_NOW, periodSec: PERIOD })
    expect(c.archetype).toBe(archetypeForKind('place'))
    expect(c.preferredCapability).toBe(capabilityForKind('place'))
  })

  it('falls back title to a placeName-derived string when absent', () => {
    const c = buildPlaceContract({ lat: 0, lon: 0, placeName: 'Nairobi', simNow: BASE_SIM_NOW, periodSec: PERIOD })
    expect(c.title).toContain('Nairobi')
  })

  it('uses supplied title when provided', () => {
    const c = buildPlaceContract({ lat: 0, lon: 0, placeName: 'X', simNow: BASE_SIM_NOW, periodSec: PERIOD, title: 'Custom Title' })
    expect(c.title).toBe('Custom Title')
  })

  it('uses supplied objective as part of title — objective is input-only, not stored on Contract', () => {
    // objective is accepted in PlaceContractInput but not propagated to Contract.
    // Supplying a title and objective; only the title is reflected on the returned contract.
    const c = buildPlaceContract({ lat: 0, lon: 0, placeName: 'X', simNow: BASE_SIM_NOW, periodSec: PERIOD, title: 'T', objective: 'Obj text' })
    expect(c.title).toBe('T')
  })
})
