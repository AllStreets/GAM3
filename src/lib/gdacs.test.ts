import { describe, it, expect } from 'vitest'
import { normalizeGdacs } from './gdacs'

const gdacsFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        eventtype: 'EQ',
        alertlevel: 'Orange',
        fromdate: '2026-08-24T12:00:00Z',
        todate: '2026-08-24T18:00:00Z',
        name: 'Earthquake in Turkey',
        htmldescription: 'Significant earthquake near Istanbul',
        eventid: 'EQ-12345',
      },
      geometry: { type: 'Point', coordinates: [29.0, 41.0] },
    },
    {
      type: 'Feature',
      properties: {
        eventtype: 'TC',
        alertlevel: 'Red',
        fromdate: '2026-08-23T06:00:00Z',
        todate: '2026-08-25T06:00:00Z',
        name: 'Tropical Cyclone DANA',
        htmldescription: 'Category 4 cyclone',
        eventid: 'TC-99887',
      },
      geometry: { type: 'Point', coordinates: [-80.5, 24.3] },
    },
    {
      type: 'Feature',
      properties: {
        eventtype: 'FL',
        alertlevel: 'Green',
        fromdate: '2026-08-22T00:00:00Z',
        todate: '2026-08-23T00:00:00Z',
        name: 'Flood in Bangladesh',
        htmldescription: 'River flooding',
        eventid: 'FL-55522',
      },
      geometry: { type: 'Point', coordinates: [90.4, 23.8] },
    },
    {
      type: 'Feature',
      properties: {
        eventtype: 'VO',
        alertlevel: 'Red',
        fromdate: '2026-08-25T00:00:00Z',
        todate: '2026-08-25T12:00:00Z',
        name: 'Etna eruption, Italy',
        htmldescription: 'Lava flows reported',
        eventid: 'VO-33301',
      },
      geometry: { type: 'Point', coordinates: [14.99, 37.73] },
    },
    {
      type: 'Feature',
      properties: {
        eventtype: 'WF',
        alertlevel: 'Orange',
        fromdate: '2026-08-24T08:00:00Z',
        todate: '2026-08-24T20:00:00Z',
        name: 'Wildfire in Portugal',
        htmldescription: 'Forest fire',
        eventid: 'WF-11100',
      },
      geometry: { type: 'Point', coordinates: [-8.0, 40.0] },
    },
    {
      type: 'Feature',
      properties: {
        eventtype: 'DR',
        alertlevel: 'Green',
        fromdate: '2026-07-01T00:00:00Z',
        todate: '2026-08-01T00:00:00Z',
        name: 'Drought in Horn of Africa',
        htmldescription: 'Prolonged drought',
        eventid: 'DR-20001',
      },
      geometry: { type: 'Point', coordinates: [42.0, 6.0] },
    },
    // Malformed: missing geometry coords
    {
      type: 'Feature',
      properties: {
        eventtype: 'EQ',
        alertlevel: 'Green',
        fromdate: '2026-08-24T00:00:00Z',
        name: 'Bad quake',
        eventid: 'EQ-BAD',
      },
      geometry: null,
    },
  ],
}

describe('normalizeGdacs', () => {
  it('maps EQ → quake with orange severity', () => {
    const events = normalizeGdacs(gdacsFeatureCollection)
    const eq = events.find((e) => e.id.includes('EQ-12345'))!
    expect(eq).toBeDefined()
    expect(eq.kind).toBe('quake')
    expect(eq.severity).toBe(0.6)
    expect(eq.lat).toBeCloseTo(41.0)
    expect(eq.lon).toBeCloseTo(29.0)
    expect(eq.title).toBe('Earthquake in Turkey')
    expect(eq.time).toBe('2026-08-24T12:00:00Z')
  })

  it('maps TC → storm with red severity', () => {
    const events = normalizeGdacs(gdacsFeatureCollection)
    const tc = events.find((e) => e.id.includes('TC-99887'))!
    expect(tc).toBeDefined()
    expect(tc.kind).toBe('storm')
    expect(tc.severity).toBe(0.9)
    expect(tc.lat).toBeCloseTo(24.3)
    expect(tc.lon).toBeCloseTo(-80.5)
  })

  it('maps FL → flood with green severity', () => {
    const events = normalizeGdacs(gdacsFeatureCollection)
    const fl = events.find((e) => e.id.includes('FL-55522'))!
    expect(fl).toBeDefined()
    expect(fl.kind).toBe('flood')
    expect(fl.severity).toBe(0.3)
  })

  it('maps VO → volcano with red severity', () => {
    const events = normalizeGdacs(gdacsFeatureCollection)
    const vo = events.find((e) => e.id.includes('VO-33301'))!
    expect(vo).toBeDefined()
    expect(vo.kind).toBe('volcano')
    expect(vo.severity).toBe(0.9)
    expect(vo.title).toBe('Etna eruption, Italy')
  })

  it('maps WF → wildfire with orange severity', () => {
    const events = normalizeGdacs(gdacsFeatureCollection)
    const wf = events.find((e) => e.id.includes('WF-11100'))!
    expect(wf).toBeDefined()
    expect(wf.kind).toBe('wildfire')
    expect(wf.severity).toBe(0.6)
  })

  it('maps DR → wildfire with green severity', () => {
    const events = normalizeGdacs(gdacsFeatureCollection)
    const dr = events.find((e) => e.id.includes('DR-20001'))!
    expect(dr).toBeDefined()
    expect(dr.kind).toBe('wildfire')
    expect(dr.severity).toBe(0.3)
  })

  it('skips features with missing geometry', () => {
    const events = normalizeGdacs(gdacsFeatureCollection)
    // 6 valid features + 1 with null geometry = 6 events
    expect(events).toHaveLength(6)
    expect(events.find((e) => e.id.includes('EQ-BAD'))).toBeUndefined()
  })

  it('returns [] for null input', () => {
    expect(normalizeGdacs(null)).toEqual([])
  })

  it('returns [] for non-FeatureCollection input', () => {
    expect(normalizeGdacs({ nope: 1 })).toEqual([])
    expect(normalizeGdacs([])).toEqual([])
    expect(normalizeGdacs('garbage')).toEqual([])
  })

  it('returns [] when features array is missing', () => {
    expect(normalizeGdacs({ type: 'FeatureCollection', features: null })).toEqual([])
  })

  it('event ids are prefixed with gdacs-', () => {
    const events = normalizeGdacs(gdacsFeatureCollection)
    expect(events.every((e) => e.id.startsWith('gdacs-'))).toBe(true)
  })
})
