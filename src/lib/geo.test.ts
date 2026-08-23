import { describe, it, expect } from 'vitest'
import { latLonToVector3, subsolarPoint, EARTH_RADIUS } from './geo'

describe('latLonToVector3', () => {
  it('maps the north pole to +Y', () => {
    const v = latLonToVector3(90, 0)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(EARTH_RADIUS, 5)
    expect(v.z).toBeCloseTo(0, 5)
  })

  it('maps (0°, 0°) — Gulf of Guinea — to +Z', () => {
    const v = latLonToVector3(0, 0)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(0, 5)
    expect(v.z).toBeCloseTo(EARTH_RADIUS, 5)
  })

  it('maps (0°, 90°E) to +X', () => {
    const v = latLonToVector3(0, 90)
    expect(v.x).toBeCloseTo(EARTH_RADIUS, 5)
    expect(v.y).toBeCloseTo(0, 5)
    expect(v.z).toBeCloseTo(0, 5)
  })

  it('respects a custom radius', () => {
    const v = latLonToVector3(0, 0, 2.5)
    expect(v.length()).toBeCloseTo(2.5, 5)
  })
})

describe('subsolarPoint', () => {
  it('puts the sun near lon 0 at 12:00 UTC', () => {
    const { lon } = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 12, 0, 0)))
    expect(Math.abs(lon)).toBeLessThan(2)
  })

  it('puts the sun near lon -90 (90°W) at 18:00 UTC', () => {
    const { lon } = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 18, 0, 0)))
    expect(lon).toBeCloseTo(-90, 0)
  })

  it('declination is ~+23.4° at June solstice', () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 5, 21, 12, 0, 0)))
    expect(lat).toBeGreaterThan(22.5)
    expect(lat).toBeLessThan(24.5)
  })

  it('declination is ~-23.4° at December solstice', () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 11, 21, 12, 0, 0)))
    expect(lat).toBeGreaterThan(-24.5)
    expect(lat).toBeLessThan(-22.5)
  })

  it('declination is near 0 at the March equinox', () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 12, 0, 0)))
    expect(Math.abs(lat)).toBeLessThan(1.5)
  })
})

import { vector3ToLatLon, greatCircleKm, ER_KM } from './geo'

describe('vector3ToLatLon', () => {
  it('inverts latLonToVector3 across a spread of points', () => {
    for (const [lat, lon] of [[0, 0], [0, 90], [45, -120], [-33.9, 151.2], [66, 179]] as const) {
      const round = vector3ToLatLon(latLonToVector3(lat, lon))
      expect(round.lat).toBeCloseTo(lat, 4)
      expect(round.lon).toBeCloseTo(lon, 4)
    }
  })
  it('maps the north pole to lat 90', () => {
    expect(vector3ToLatLon(latLonToVector3(90, 0)).lat).toBeCloseTo(90, 4)
  })
})

describe('greatCircleKm', () => {
  it('is zero for identical points', () => {
    expect(greatCircleKm(40, -74, 40, -74)).toBeCloseTo(0, 6)
  })
  it('is ~half Earth circumference for antipodes', () => {
    const half = Math.PI * ER_KM
    expect(greatCircleKm(0, 0, 0, 180)).toBeCloseTo(half, 0)
  })
  it('matches a known city distance (NYC↔London ≈ 5570 km, ±40)', () => {
    const d = greatCircleKm(40.71, -74.01, 51.51, -0.13)
    expect(d).toBeGreaterThan(5530)
    expect(d).toBeLessThan(5610)
  })
})
