import { describe, it, expect } from 'vitest'
import { archetypeForKind, capabilityForKind, matchBonusFunding, orderEventsForArchetype, CAPABILITY_MATCH_BONUS } from './contractMeta'

describe('contractMeta', () => {
  it('maps event kinds to archetype lanes', () => {
    expect(archetypeForKind('earthquake')).toBe('relief')
    expect(archetypeForKind('wildfire')).toBe('relief')
    expect(archetypeForKind('launch')).toBe('defense')
    expect(archetypeForKind('volcano')).toBe('research')
    expect(archetypeForKind('mystery')).toBe('research') // default
  })
  it('maps event kinds to preferred capability', () => {
    expect(capabilityForKind('wildfire')).toBe('thermal')
    expect(capabilityForKind('volcano')).toBe('thermal')
    expect(capabilityForKind('launch')).toBe('comms')
    expect(capabilityForKind('earthquake')).toBe('imaging') // default
  })
  it('applies the capability match bonus to funding', () => {
    expect(matchBonusFunding(400, false)).toBe(400)
    expect(matchBonusFunding(400, true)).toBe(Math.round(400 * (1 + CAPABILITY_MATCH_BONUS)))
  })

  // New kinds: volcano, flood, spaceweather
  it('volcano → research archetype, thermal capability', () => {
    expect(archetypeForKind('volcano')).toBe('research')
    expect(capabilityForKind('volcano')).toBe('thermal')
  })

  it('flood → relief archetype, imaging capability', () => {
    expect(archetypeForKind('flood')).toBe('relief')
    expect(capabilityForKind('flood')).toBe('imaging')
  })

  it('spaceweather → research archetype, thermal capability', () => {
    expect(archetypeForKind('spaceweather')).toBe('research')
    expect(capabilityForKind('spaceweather')).toBe('thermal')
  })
})

describe('orderEventsForArchetype', () => {
  const ev = (id: string, kind: string) => ({ id, kind })

  it('puts relief-lane events first for a relief agency', () => {
    const events = [ev('a', 'launch'), ev('b', 'volcano'), ev('c', 'quake'), ev('d', 'storm')]
    const ordered = orderEventsForArchetype(events, 'relief')
    const ids = ordered.map((e) => e.id)
    // quake and storm are relief-lane; launch and volcano are not
    expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('a'))
    expect(ids.indexOf('d')).toBeLessThan(ids.indexOf('a'))
    expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('b'))
    expect(ids.indexOf('d')).toBeLessThan(ids.indexOf('b'))
  })

  it('puts defense-lane events first for a defense agency', () => {
    const events = [ev('a', 'quake'), ev('b', 'launch'), ev('c', 'volcano'), ev('d', 'rocket')]
    const ordered = orderEventsForArchetype(events, 'defense')
    const ids = ordered.map((e) => e.id)
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('a'))
    expect(ids.indexOf('d')).toBeLessThan(ids.indexOf('a'))
  })

  it('puts research-lane events first for a research agency', () => {
    const events = [ev('a', 'quake'), ev('b', 'volcano'), ev('c', 'launch')]
    const ordered = orderEventsForArchetype(events, 'research')
    const ids = ordered.map((e) => e.id)
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('a'))
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'))
  })

  it('preserves original order within each tier (stable sort)', () => {
    const events = [ev('a', 'quake'), ev('b', 'storm'), ev('c', 'launch'), ev('d', 'wildfire')]
    const ordered = orderEventsForArchetype(events, 'relief')
    const reliefIds = ordered.filter((e) => archetypeForKind(e.kind) === 'relief').map((e) => e.id)
    // a (quake) should come before b (storm), and b before d (wildfire) in relief tier
    expect(reliefIds).toEqual(['a', 'b', 'd'])
  })

  it('returns original order unchanged when archetype is null', () => {
    const events = [ev('a', 'launch'), ev('b', 'quake'), ev('c', 'volcano')]
    const ordered = orderEventsForArchetype(events, null)
    expect(ordered.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the original array', () => {
    const events = [ev('a', 'launch'), ev('b', 'quake')]
    const original = [...events]
    orderEventsForArchetype(events, 'relief')
    expect(events).toEqual(original)
  })
})
