import { describe, it, expect } from 'vitest'
import { normalizeSpaceWeather } from './spaceWeather'

// NOAA planetary-K-index JSON: array of rows, first row is headers
// [time_tag, kp, a_running, station_count]
const kIndexQuiet = [
  ['time_tag', 'kp', 'a_running', 'station_count'],
  ['2026-08-25 00:00:00', '1.67', '3', '5'],
  ['2026-08-25 03:00:00', '2.00', '4', '5'],
  ['2026-08-25 06:00:00', '0.33', '1', '5'],
  ['2026-08-25 09:00:00', '1.00', '2', '5'],
]

const kIndexStorm = [
  ['time_tag', 'kp', 'a_running', 'station_count'],
  ['2026-08-25 00:00:00', '1.67', '3', '5'],
  ['2026-08-25 03:00:00', '3.00', '9', '5'],
  ['2026-08-25 06:00:00', '5.67', '39', '5'],
  ['2026-08-25 09:00:00', '7.00', '111', '5'],
]

const kIndexSevereStorm = [
  ['time_tag', 'kp', 'a_running', 'station_count'],
  ['2026-08-25 00:00:00', '4.33', '27', '5'],
  ['2026-08-25 03:00:00', '9.00', '400', '5'],
]

describe('normalizeSpaceWeather', () => {
  it('returns [] when Kp is below 5 (quiet conditions)', () => {
    expect(normalizeSpaceWeather(kIndexQuiet)).toEqual([])
  })

  it('returns a spaceweather event when last row Kp ≥ 5', () => {
    const events = normalizeSpaceWeather(kIndexStorm)
    expect(events).toHaveLength(1)
    const e = events[0]
    expect(e.kind).toBe('spaceweather')
    expect(e.title).toContain('Geomagnetic storm')
    expect(e.title).toContain('7') // Kp value in title
    expect(e.severity).toBeGreaterThanOrEqual(0.5)
    expect(e.severity).toBeLessThanOrEqual(1.0)
    expect(e.lat).toBe(65) // representative auroral lat
  })

  it('scales severity from Kp 5 → 0.5 through Kp 9 → 1.0', () => {
    const eventsKp7 = normalizeSpaceWeather(kIndexStorm)
    expect(eventsKp7[0].severity).toBeCloseTo((7 - 5) / 4 * 0.5 + 0.5, 5) // Kp 7 → 0.75

    const eventsKp9 = normalizeSpaceWeather(kIndexSevereStorm)
    expect(eventsKp9[0].severity).toBeCloseTo(1.0, 5) // Kp 9 → 1.0
  })

  it('places event at deterministic auroral lat/lon (65, 0)', () => {
    const events = normalizeSpaceWeather(kIndexStorm)
    expect(events[0].lat).toBe(65)
    expect(events[0].lon).toBe(0)
  })

  it('sets a deterministic id based on the time_tag', () => {
    const events = normalizeSpaceWeather(kIndexStorm)
    expect(events[0].id).toContain('spaceweather-')
    expect(typeof events[0].id).toBe('string')
  })

  it('returns [] for null/garbage input', () => {
    expect(normalizeSpaceWeather(null)).toEqual([])
    expect(normalizeSpaceWeather('garbage')).toEqual([])
    expect(normalizeSpaceWeather({})).toEqual([])
    expect(normalizeSpaceWeather([])).toEqual([])
  })

  it('returns [] when array has only header row', () => {
    expect(normalizeSpaceWeather([['time_tag', 'kp', 'a_running', 'station_count']])).toEqual([])
  })

  it('skips malformed rows gracefully', () => {
    const withBadRow = [
      ['time_tag', 'kp', 'a_running', 'station_count'],
      ['2026-08-25 06:00:00', 'not-a-number', '0', '5'],
    ]
    expect(normalizeSpaceWeather(withBadRow)).toEqual([])
  })
})
