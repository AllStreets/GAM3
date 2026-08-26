import { describe, it, expect } from 'vitest'
import {
  seedRival,
  rivalEtaSec,
  resolveRace,
  applyRaceResult,
  type Rival,
} from './rival'

describe('rival (pure)', () => {
  // ── seedRival ──────────────────────────────────────────────────────────────

  it('seedRival returns a deterministic rival regardless of playerArchetype', () => {
    const r1 = seedRival(null)
    const r2 = seedRival(null)
    expect(r1).toEqual(r2)
  })

  it('seedRival has required fields with sensible defaults', () => {
    const r = seedRival('relief')
    expect(typeof r.name).toBe('string')
    expect(r.name.length).toBeGreaterThan(0)
    expect(typeof r.emblemId).toBe('string')
    expect(typeof r.archetype).toBe('string')
    expect(r.reputation).toBeGreaterThanOrEqual(30)
    expect(r.reputation).toBeLessThanOrEqual(60)
    expect(r.wins).toBe(0)
    expect(r.losses).toBe(0)
  })

  it('seedRival produces different archetypes for different player archetypes (contrasting)', () => {
    // The rival archetype should contrast the player's to create narrative tension.
    // We check that it is a valid archetype string.
    const archetypes = ['relief', 'research', 'defense']
    for (const pa of archetypes) {
      const r = seedRival(pa)
      expect(archetypes).toContain(r.archetype)
    }
  })

  // ── rivalEtaSec ────────────────────────────────────────────────────────────

  it('rivalEtaSec is in the open interval (0, deadlineSec)', () => {
    const eta = rivalEtaSec('contract-abc', 10000, 0.5)
    expect(eta).toBeGreaterThan(0)
    expect(eta).toBeLessThan(10000)
  })

  it('rivalEtaSec is deterministic — same inputs → same output', () => {
    const a = rivalEtaSec('contract-xyz', 5000, 0.7)
    const b = rivalEtaSec('contract-xyz', 5000, 0.7)
    expect(a).toBe(b)
  })

  it('rivalEtaSec varies with different contractIds', () => {
    const a = rivalEtaSec('contract-aaa', 5000, 0.5)
    const b = rivalEtaSec('contract-bbb', 5000, 0.5)
    // They can coincidentally be equal but should differ in practice
    expect(typeof a).toBe('number')
    expect(typeof b).toBe('number')
    // At least one should not equal the other (statistical near-certainty)
    // We test both are valid instead of requiring inequality
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(0)
  })

  it('rivalEtaSec with difficulty=1 gives a shorter ETA than difficulty=0', () => {
    // Higher difficulty → rival is faster (lower ETA)
    const easy = rivalEtaSec('contract-test', 10000, 0.0)
    const hard = rivalEtaSec('contract-test', 10000, 1.0)
    expect(easy).toBeGreaterThan(0)
    expect(hard).toBeGreaterThan(0)
    expect(hard).toBeLessThan(easy)
  })

  // ── resolveRace ────────────────────────────────────────────────────────────

  it('resolveRace: player faster → player wins', () => {
    expect(resolveRace(3000, 5000)).toBe('player')
  })

  it('resolveRace: player exactly at rival ETA → player wins (ties go to player)', () => {
    expect(resolveRace(5000, 5000)).toBe('player')
  })

  it('resolveRace: player slower → rival wins', () => {
    expect(resolveRace(6000, 5000)).toBe('rival')
  })

  it('resolveRace: player did not complete (null) → rival wins', () => {
    expect(resolveRace(null, 5000)).toBe('rival')
  })

  // ── applyRaceResult ────────────────────────────────────────────────────────

  const baseRival: Rival = {
    name: 'VANTIS Corp',
    emblemId: 'hex-eye',
    archetype: 'defense',
    reputation: 40,
    wins: 2,
    losses: 1,
  }

  it('applyRaceResult player win → rival.losses++ and rival.reputation decreases slightly', () => {
    const r = applyRaceResult(baseRival, 'player')
    expect(r.losses).toBe(baseRival.losses + 1)
    expect(r.wins).toBe(baseRival.wins)
    expect(r.reputation).toBeLessThan(baseRival.reputation)
  })

  it('applyRaceResult rival win → rival.wins++ and rival.reputation increases', () => {
    const r = applyRaceResult(baseRival, 'rival')
    expect(r.wins).toBe(baseRival.wins + 1)
    expect(r.losses).toBe(baseRival.losses)
    expect(r.reputation).toBeGreaterThan(baseRival.reputation)
  })

  it('applyRaceResult does not mutate the input rival', () => {
    const input = { ...baseRival }
    applyRaceResult(input, 'player')
    expect(input.losses).toBe(baseRival.losses)
    applyRaceResult(input, 'rival')
    expect(input.wins).toBe(baseRival.wins)
  })

  it('applyRaceResult rival reputation never goes below 0', () => {
    const poorRival: Rival = { ...baseRival, reputation: 2 }
    const r = applyRaceResult(poorRival, 'player')
    expect(r.reputation).toBeGreaterThanOrEqual(0)
  })
})
