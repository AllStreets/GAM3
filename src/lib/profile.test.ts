import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadProfile, recordBurn, recordAbort, recordFocus, recordSession,
  profileSummary, resetProfileForTest,
} from './profile'

beforeEach(() => resetProfileForTest())

describe('profile', () => {
  it('starts fresh', () => {
    const p = loadProfile()
    expect(p.burns).toBe(0)
    expect(p.focusCounts).toEqual({})
    expect(p.lastSeen).toBeNull()
  })

  it('records burns with quality and dv', () => {
    recordBurn(40, 0.8)
    recordBurn(60, 0.6)
    const s = profileSummary()
    expect(s.burns).toBe(2)
    expect(s.dvSpent).toBeCloseTo(100)
    expect(s.avgQuality).toBeCloseTo(0.7)
  })

  it('records aborts and focus kinds; favoriteKind is the modal kind', () => {
    recordAbort()
    recordFocus('quake'); recordFocus('quake'); recordFocus('storm')
    const s = profileSummary()
    expect(s.aborts).toBe(1)
    expect(s.favoriteKind).toBe('quake')
  })

  it('favoriteKind is null with no focuses; avgQuality 0 with no burns', () => {
    const s = profileSummary()
    expect(s.favoriteKind).toBeNull()
    expect(s.avgQuality).toBe(0)
  })

  it('recordSession increments and stamps lastSeen', () => {
    recordSession()
    const p = loadProfile()
    expect(p.sessions).toBe(1)
    expect(p.lastSeen).not.toBeNull()
  })

  it('survives corrupt storage', () => {
    // Simulate corrupt JSON via the test seam
    resetProfileForTest('not-json{{{')
    expect(loadProfile().burns).toBe(0)
  })
})
