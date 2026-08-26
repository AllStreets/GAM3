import { describe, it, expect } from 'vitest'
import { advanceArc, pickArcTheme, type Arc } from './storyProgress'

const BASE_ARC: Arc = { id: 'main', theme: 'Emergence', tension: 0.5, beatsSeen: 0 }

describe('advanceArc', () => {
  it('increments beatsSeen on every call', () => {
    const a = advanceArc(BASE_ARC, false)
    expect(a.beatsSeen).toBe(1)
    const b = advanceArc(a, true)
    expect(b.beatsSeen).toBe(2)
  })

  it('raises tension by 0.15 when escalate = true', () => {
    const a = advanceArc(BASE_ARC, true)
    expect(a.tension).toBeCloseTo(0.65)
  })

  it('drops tension by 0.05 when escalate = false', () => {
    const a = advanceArc(BASE_ARC, false)
    expect(a.tension).toBeCloseTo(0.45)
  })

  it('clamps tension at 1.0 when escalating from high tension', () => {
    const high: Arc = { ...BASE_ARC, tension: 0.95 }
    const a = advanceArc(high, true)
    expect(a.tension).toBe(1.0)
  })

  it('clamps tension at 0.0 when de-escalating from near zero', () => {
    const low: Arc = { ...BASE_ARC, tension: 0.02 }
    const a = advanceArc(low, false)
    expect(a.tension).toBe(0.0)
  })

  it('preserves arc id and theme', () => {
    const a = advanceArc(BASE_ARC, true)
    expect(a.id).toBe('main')
    expect(a.theme).toBe('Emergence')
  })
})

describe('pickArcTheme', () => {
  it('returns a deterministic theme for a given archetype + recent kinds', () => {
    const t1 = pickArcTheme('relief', ['earthquake', 'flood', 'earthquake'])
    const t2 = pickArcTheme('relief', ['earthquake', 'flood', 'earthquake'])
    expect(t1).toBe(t2)
  })

  it('differs by archetype for the same kinds', () => {
    const t1 = pickArcTheme('relief', ['earthquake'])
    const t2 = pickArcTheme('defense', ['earthquake'])
    expect(t1).not.toBe(t2)
  })

  it('differs by dominant kind', () => {
    const t1 = pickArcTheme('research', ['earthquake', 'earthquake'])
    const t2 = pickArcTheme('research', ['fire', 'fire'])
    expect(t1).not.toBe(t2)
  })

  it('handles null archetype gracefully', () => {
    const t = pickArcTheme(null, ['flood'])
    expect(typeof t).toBe('string')
    expect(t.length).toBeGreaterThan(0)
  })

  it('handles empty kinds list', () => {
    const t = pickArcTheme('relief', [])
    expect(typeof t).toBe('string')
    expect(t.length).toBeGreaterThan(0)
  })
})
