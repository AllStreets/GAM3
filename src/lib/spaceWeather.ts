import type { WorldEvent } from './worldEvents'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Normalise NOAA SWPC planetary-K-index JSON into WorldEvents.
 * Pure: no network calls, no Date.now(), no Math.random().
 *
 * Feed URL: https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json
 * Format: array of rows; first row is column headers.
 *   [time_tag, kp, a_running, station_count]
 *
 * Emits a single 'spaceweather' event ONLY when the last data row's Kp ≥ 5
 * (G1 geomagnetic storm threshold). Returns [] when quiet or input is garbage.
 *
 * Severity scale: Kp 5 → 0.5, Kp 9 → 1.0 (linear between).
 * Location: representative auroral oval point at lat 65, lon 0 (deterministic).
 */
export function normalizeSpaceWeather(raw: unknown): WorldEvent[] {
  if (!Array.isArray(raw) || raw.length < 2) return []

  // Last row is the most recent observation (skip header row at index 0)
  const lastRow = raw[raw.length - 1]
  if (!Array.isArray(lastRow) || lastRow.length < 2) return []

  const timeTag = lastRow[0]
  const kpRaw = lastRow[1]

  const kp = typeof kpRaw === 'string' ? Number(kpRaw) : (typeof kpRaw === 'number' ? kpRaw : NaN)
  if (!Number.isFinite(kp)) return []
  if (kp < 5) return []

  // Clamp Kp to [5, 9] and linearly map to severity [0.5, 1.0]
  const clampedKp = Math.min(9, Math.max(5, kp))
  const severity = 0.5 + ((clampedKp - 5) / 4) * 0.5

  // Build a deterministic id from the time_tag
  const safeTime = typeof timeTag === 'string' ? timeTag.replace(/[^0-9T\-:Z]/g, '-') : 'unknown'
  const id = `spaceweather-${safeTime}`

  // Title shows the rounded Kp value
  const kpDisplay = Math.round(kp)
  const title = `Geomagnetic storm — Kp ${kpDisplay}`

  // ISO time: try to parse the NOAA time_tag (format: "YYYY-MM-DD HH:MM:SS")
  let time: string
  try {
    const isoCandidate = typeof timeTag === 'string' ? timeTag.replace(' ', 'T') + 'Z' : ''
    const d = new Date(isoCandidate)
    time = Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString()
  } catch {
    time = new Date(0).toISOString()
  }

  const event: WorldEvent = {
    id,
    kind: 'spaceweather',
    title,
    lat: 65,  // representative auroral oval latitude
    lon: 0,   // deterministic fixed longitude
    time,
    severity,
    detail: `NOAA Kp-index ${kp.toFixed(2)}`,
  }

  return [event]
}
