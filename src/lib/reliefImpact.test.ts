import { describe, it, expect } from 'vitest'
import { reliefImpactLine } from './reliefImpact'

describe('reliefImpactLine', () => {
  it('returns a non-empty string for any input', () => {
    expect(reliefImpactLine('unknown', 'Some Event')).toBeTruthy()
  })

  it('quake input returns a respectful string mentioning relief or responders', () => {
    const line = reliefImpactLine('earthquake', 'M6.4 Earthquake')
    expect(line.length).toBeGreaterThan(0)
    expect(line).toMatch(/relief|responder/i)
  })

  it('seismic keyword also matches the quake branch', () => {
    const line = reliefImpactLine('seismic', 'Seismic Event')
    expect(line).toMatch(/relief|responder/i)
  })

  it('wildfire input mentions fire or thermal', () => {
    const line = reliefImpactLine('wildfire', 'Wildfire Outbreak')
    expect(line).toMatch(/fire|thermal/i)
  })

  it('fire keyword also matches the fire branch', () => {
    const line = reliefImpactLine('fire', 'Forest Fire')
    expect(line).toMatch(/fire|thermal/i)
  })

  it('flood input returns a water-related line', () => {
    const line = reliefImpactLine('flood', 'Coastal Flooding')
    expect(line).toMatch(/water|flood|inundation/i)
  })

  it('storm/cyclone/typhoon/hurricane all match the storm branch', () => {
    for (const kind of ['storm', 'cyclone', 'typhoon', 'hurricane']) {
      const line = reliefImpactLine(kind, 'Storm Event')
      expect(line).toMatch(/shelter|track|responder/i)
    }
  })

  it('is pure and deterministic — same input always returns identical output', () => {
    const a = reliefImpactLine('earthquake', 'M7.1 Quake')
    const b = reliefImpactLine('earthquake', 'M7.1 Quake')
    expect(a).toBe(b)
  })

  it('wildfire called twice returns identical output', () => {
    expect(reliefImpactLine('wildfire', 'Fire')).toBe(reliefImpactLine('wildfire', 'Fire'))
  })

  it('default branch returns the safe fallback for unknown kinds', () => {
    const line = reliefImpactLine('volcano', 'Volcanic Activity')
    expect(line).toBe('Data relayed to response teams · situational picture improved')
  })

  it('line contains no numeric digits (no casualty-count risk)', () => {
    const kinds = ['earthquake', 'flood', 'hurricane', 'wildfire', 'unknown']
    for (const kind of kinds) {
      expect(reliefImpactLine(kind, 'Event')).not.toMatch(/\d/)
    }
  })
})
