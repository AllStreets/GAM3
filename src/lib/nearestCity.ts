import { greatCircleKm } from '@/lib/geo'
import { CITIES, type City } from '@/data/cities'

export interface NearestCity { city: City; km: number }

export function nearestCity(lat: number, lon: number, cities: City[] = CITIES): NearestCity {
  let best = cities[0]
  let bestKm = Infinity
  for (const c of cities) {
    const km = greatCircleKm(lat, lon, c.lat, c.lon)
    if (km < bestKm) { bestKm = km; best = c }
  }
  return { city: best, km: bestKm }
}

export function placeLabel(lat: number, lon: number, cities: City[] = CITIES): string {
  const { city, km } = nearestCity(lat, lon, cities)
  if (km <= 400) return `near ${city.name}, ${city.country}`
  if (km <= 1500) return `${city.country} region`
  return 'Open ocean'
}
