export interface PlaystyleProfile {
  burns: number
  aborts: number
  dvSpent: number
  qualitySum: number
  focusCounts: Record<string, number>
  sessions: number
  lastSeen: string | null
}

const KEY = 'hyperion-profile-v1'

const memoryShim = (() => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
})()

const storage: Pick<Storage, 'getItem' | 'setItem'> =
  typeof window !== 'undefined' && window.localStorage ? window.localStorage : memoryShim

function fresh(): PlaystyleProfile {
  return { burns: 0, aborts: 0, dvSpent: 0, qualitySum: 0, focusCounts: {}, sessions: 0, lastSeen: null }
}

export function loadProfile(): PlaystyleProfile {
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return fresh()
    const p = JSON.parse(raw) as PlaystyleProfile
    if (typeof p.burns !== 'number') return fresh()
    return { ...fresh(), ...p }
  } catch {
    return fresh()
  }
}

function save(p: PlaystyleProfile) {
  try {
    storage.setItem(KEY, JSON.stringify(p))
  } catch {
    // storage full/unavailable — profile is a nice-to-have, never crash gameplay
  }
}

export function recordBurn(costMs: number, quality: number) {
  const p = loadProfile()
  p.burns += 1
  p.dvSpent += costMs
  p.qualitySum += quality
  save(p)
}

export function recordAbort() {
  const p = loadProfile()
  p.aborts += 1
  save(p)
}

export function recordFocus(kind: string) {
  const p = loadProfile()
  p.focusCounts[kind] = (p.focusCounts[kind] ?? 0) + 1
  save(p)
}

export function recordSession() {
  const p = loadProfile()
  p.sessions += 1
  p.lastSeen = new Date().toISOString()
  save(p)
}

export function profileSummary() {
  const p = loadProfile()
  const kinds = Object.entries(p.focusCounts).sort((a, b) => b[1] - a[1])
  return {
    burns: p.burns,
    aborts: p.aborts,
    dvSpent: p.dvSpent,
    avgQuality: p.burns > 0 ? p.qualitySum / p.burns : 0,
    favoriteKind: kinds.length > 0 ? kinds[0][0] : null,
    sessions: p.sessions,
    lastSeen: p.lastSeen,
  }
}

/** Test seam: clear (or seed) the backing storage. */
export function resetProfileForTest(seed?: string) {
  if (seed !== undefined) storage.setItem(KEY, seed)
  else storage.setItem(KEY, '')
}
