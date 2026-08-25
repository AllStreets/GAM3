import { describe, it, expect } from 'vitest'
import { nearestCity, placeLabel } from './nearestCity'
import type { City } from '@/data/cities'

const FIX: City[] = [
  { name: 'London', country: 'United Kingdom', lat: 51.5, lon: -0.13 },
  { name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69 },
  { name: 'Nairobi', country: 'Kenya', lat: -1.29, lon: 36.82 },
]

describe('nearestCity', () => {
  it('returns the closest city with a positive distance', () => {
    const r = nearestCity(51.6, -0.1, FIX)
    expect(r.city.name).toBe('London')
    expect(r.km).toBeGreaterThanOrEqual(0)
    expect(r.km).toBeLessThan(50)
  })
  it('picks Tokyo for a point in Japan', () => {
    expect(nearestCity(35.7, 139.7, FIX).city.name).toBe('Tokyo')
  })
})

describe('placeLabel', () => {
  it('names a nearby city', () => {
    expect(placeLabel(51.55, -0.12, FIX)).toMatch(/near London, United Kingdom/)
  })
  it('calls the deep ocean open water', () => {
    // mid-Pacific, far from every fixture city
    expect(placeLabel(-30, -140, FIX)).toMatch(/Open ocean|Remote/)
  })
})
