/**
 * persistStatus.ts — Lightweight module-level signal for the save-sync state.
 *
 * Used by PersistBridge (writer) and SettingsPanel (reader).
 * Kept as a zustand store so SettingsPanel re-renders reactively without
 * polling or prop-drilling.
 *
 * States:
 *   'synced'  — last server save/load succeeded (signed in → cloud, else anon device)
 *   'local'   — no server interaction yet (first load or DB unavailable before first call)
 *   'offline' — last server call failed (network/DB down); game runs from localStorage
 */

import { create } from 'zustand'

export type PersistStatus = 'synced' | 'local' | 'offline'

interface PersistStatusState {
  status: PersistStatus
  setStatus: (s: PersistStatus) => void
}

export const usePersistStatus = create<PersistStatusState>((set) => ({
  status: 'local',
  setStatus: (s) => set({ status: s }),
}))

/** Convenience helpers for PersistBridge (avoids re-rendering the bridge itself). */
export function markSynced(): void {
  usePersistStatus.getState().setStatus('synced')
}

export function markOffline(): void {
  usePersistStatus.getState().setStatus('offline')
}
