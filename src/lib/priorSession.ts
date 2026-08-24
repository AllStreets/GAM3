/**
 * Captures the player's lastSeen timestamp from the PREVIOUS session,
 * BEFORE recordSession() in BriefingPanel overwrites it with the current time.
 *
 * This module is evaluated at import time (module-level code runs once on
 * first import). As long as it is imported before BriefingPanel's useEffect
 * fires (which happens after mount), this will hold the prior value.
 *
 * ColdOpenScreen imports this; Hud mounts ColdOpenScreen before BriefingPanel
 * has a chance to call recordSession(), so the ordering is guaranteed.
 */

const PROFILE_KEY = 'hyperion-profile-v1'

function readLastSeenFromStorage(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { lastSeen?: string | null }
    return typeof parsed.lastSeen === 'string' ? parsed.lastSeen : null
  } catch {
    return null
  }
}

/** The lastSeen value from the PREVIOUS session (read once at module init). */
const _priorLastSeen: string | null = readLastSeenFromStorage()

export function getPriorLastSeen(): string | null {
  return _priorLastSeen
}
