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
