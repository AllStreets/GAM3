/**
 * anonId.ts — Persistent anonymous device identity for HYPERION.
 *
 * Returns a stable UUID stored in localStorage under `hyperion-anon-id`.
 * Creates one on first call (browser only).
 *
 * Rules:
 *  - SSR-safe: returns '' on the server (no localStorage, no throw).
 *  - Never throws.
 *  - Pure-ish: idempotent after first write.
 */

const STORAGE_KEY = 'hyperion-anon-id'

export function getAnonId(): string {
  // SSR guard: localStorage does not exist on the server.
  if (typeof window === 'undefined') return ''

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (existing && existing.length > 0) return existing

    const id = crypto.randomUUID()
    window.localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    // localStorage may be blocked (private browsing, storage full, etc.)
    // Return '' so callers can decide whether to skip the server round-trip.
    return ''
  }
}
