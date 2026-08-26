/**
 * worldDigest.ts — Lightweight zustand signal for the server-provided WorldDigest.
 *
 * Set by PersistBridge after server hydrate (when the /api/load response contains
 * a hyperion-worlddigest-v1 blob). Cleared by ColdOpenScreen on dismiss so the
 * digest shows exactly once per away-tick.
 *
 * Pattern mirrors persistStatus.ts (small zustand store, module-level helpers).
 */

import { create } from 'zustand'
import type { WorldDigest } from '@/lib/worldTick'

interface WorldDigestState {
  digest: WorldDigest | null
  setDigest: (d: WorldDigest) => void
  clearDigest: () => void
}

export const useWorldDigest = create<WorldDigestState>((set) => ({
  digest: null,
  setDigest: (d) => set({ digest: d }),
  clearDigest: () => set({ digest: null }),
}))

/** Returns true when the digest has at least one meaningful change to surface. */
export function hasDigestChanges(digest: WorldDigest): boolean {
  return (
    digest.contractsExpired.length > 0 ||
    digest.rivalClaimed.length > 0 ||
    digest.newOffers > 0 ||
    digest.arcBeat !== null ||
    digest.dispatches.length > 0
  )
}

/** Convenience helpers for PersistBridge (avoids re-rendering the bridge itself). */
export function setDigest(d: WorldDigest): void {
  useWorldDigest.getState().setDigest(d)
}

export function clearDigest(): void {
  useWorldDigest.getState().clearDigest()
}
