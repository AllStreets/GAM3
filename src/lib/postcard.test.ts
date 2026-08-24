import { describe, it, expect } from 'vitest'
import { postcardCaption } from '@/lib/postcard'

// simNow() starts at sim second 0 = 2026-01-01T00:00:00Z
// TIME_SCALE = 20, so wall seconds → sim seconds: simS = wallS * 20 (from origin)

describe('postcardCaption', () => {
  it('uses "Orbital view" when no contract title', () => {
    const caption = postcardCaption({ simTime: 0 })
    expect(caption).toMatch(/^Orbital view/)
  })

  it('includes the contract title when provided', () => {
    const caption = postcardCaption({ contractTitle: 'Storm Relief', simTime: 0 })
    expect(caption).toMatch(/^Storm Relief/)
  })

  it('includes a SD stardate', () => {
    const caption = postcardCaption({ simTime: 0 })
    expect(caption).toMatch(/SD \d{4}\.\d{3}/)
  })

  it('stardate year is 2026 at sim t=0', () => {
    const caption = postcardCaption({ simTime: 0 })
    expect(caption).toContain('2026.000')
  })

  it('day-of-year increments correctly across sim time', () => {
    // 1 real day = TIME_SCALE * 86400 sim seconds = 20 * 86400 = 1_728_000
    const oneSimDay = 20 * 86400
    const caption = postcardCaption({ simTime: oneSimDay })
    expect(caption).toContain('2026.001')
  })

  it('crosses into 2027 after 365 sim-days', () => {
    const simDaysInYear = 365 * 20 * 86400
    const caption = postcardCaption({ simTime: simDaysInYear })
    expect(caption).toMatch(/SD 2027/)
  })
})
