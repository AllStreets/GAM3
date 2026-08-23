import { describe, it, expect } from 'vitest'
import { normalizeUsgs, normalizeEonet, normalizeLaunches } from './worldEvents'

const usgsFixture = {
  features: [
    {
      id: 'us7000abcd',
      properties: { mag: 6.3, place: '42 km SW of Hokkaido, Japan', time: 1755900000000, url: 'https://usgs.gov/x' },
      geometry: { coordinates: [143.2, 41.8, 35.0] },
    },
    { id: 'bad', properties: { mag: null, place: null, time: null }, geometry: null },
  ],
}

const eonetFixture = {
  events: [
    {
      id: 'EONET_1234',
      title: 'Bootleg Fire, Oregon',
      categories: [{ id: 'wildfires', title: 'Wildfires' }],
      geometry: [
        { coordinates: [-121.4, 42.6], date: '2026-08-20T10:00:00Z' },
        { coordinates: [-121.5, 42.7], date: '2026-08-22T10:00:00Z' },
      ],
    },
    {
      id: 'EONET_5678',
      title: 'Hurricane Odette',
      categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
      geometry: [{ coordinates: [-71.2, 24.5], date: '2026-08-22T06:00:00Z' }],
    },
    {
      id: 'EONET_9999',
      title: 'Iceberg A-23A',
      categories: [{ id: 'seaLakeIce', title: 'Sea and Lake Ice' }],
      geometry: [{ coordinates: [-40.0, -75.0], date: '2026-08-22T00:00:00Z' }],
    },
  ],
}

const launchFixture = {
  results: [
    {
      id: 'll-abc',
      name: 'Falcon 9 | Starlink Group 12-9',
      net: '2026-08-23T14:30:00Z',
      pad: { latitude: '28.56', longitude: '-80.57', location: { name: 'Cape Canaveral, FL, USA' } },
    },
    { id: 'll-bad', name: 'No Pad', net: '2026-08-24T00:00:00Z', pad: null },
  ],
}

describe('normalizeUsgs', () => {
  it('maps a quake feature to a WorldEvent', () => {
    const events = normalizeUsgs(usgsFixture)
    expect(events).toHaveLength(1)
    const e = events[0]
    expect(e).toMatchObject({ id: 'usgs-us7000abcd', kind: 'quake', lat: 41.8, lon: 143.2 })
    expect(e.title).toContain('M6.3')
    expect(e.severity).toBeCloseTo(6.3 / 9, 5)
    expect(e.time).toBe(new Date(1755900000000).toISOString())
  })
  it('returns [] for malformed input', () => {
    expect(normalizeUsgs(null)).toEqual([])
    expect(normalizeUsgs({ nope: 1 })).toEqual([])
  })
})

describe('normalizeEonet', () => {
  it('maps wildfires and storms using the LATEST geometry point, skips other categories', () => {
    const events = normalizeEonet(eonetFixture)
    expect(events).toHaveLength(2)
    const fire = events.find((e) => e.kind === 'wildfire')!
    expect(fire.lat).toBeCloseTo(42.7)
    expect(fire.lon).toBeCloseTo(-121.5)
    expect(fire.severity).toBe(0.5)
    const storm = events.find((e) => e.kind === 'storm')!
    expect(storm.title).toBe('Hurricane Odette')
    expect(storm.severity).toBe(0.7)
  })
  it('returns [] for malformed input', () => {
    expect(normalizeEonet(undefined)).toEqual([])
  })
})

describe('normalizeLaunches', () => {
  it('maps an upcoming launch with pad coordinates', () => {
    const events = normalizeLaunches(launchFixture)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      id: 'launch-ll-abc', kind: 'launch', lat: 28.56, lon: -80.57, severity: 0.4,
    })
    expect(events[0].detail).toBe('Cape Canaveral, FL, USA')
  })
  it('returns [] for malformed input', () => {
    expect(normalizeLaunches(42)).toEqual([])
  })
})
