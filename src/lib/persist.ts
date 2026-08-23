const memory = new Map<string, string>()

const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  typeof window !== 'undefined' && window.localStorage
    ? window.localStorage
    : {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => void memory.set(k, v),
        removeItem: (k) => void memory.delete(k),
      }

/** Load a JSON blob merged over a fallback; returns fallback on any error. */
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) }
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable — persistence is best-effort, never crash gameplay
  }
}

export function clearKey(key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // ignore
  }
}
