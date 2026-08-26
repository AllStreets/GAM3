'use client'

/**
 * PersistBridge.tsx — Server-hydration + write-through bridge.
 *
 * Mount order (inside StoreHydrator, AFTER local hydrate has run):
 *   1. On mount: GET /api/load. For each server save returned, write its data
 *      to localStorage THEN call the store's existing hydrate() so server data
 *      wins (and the store's back-compat normalisation path runs as normal).
 *   2. Once load settles (success OR failure): arm debounced write-through
 *      subscriptions on each zustand store.
 *
 * Failure contract (always-degrade):
 *   - /api/load fails → skip injection, arm write-through, game runs from local.
 *   - /api/save fails → silently ignored; localStorage is already the local mirror.
 *   - No DB / anonId unavailable → same: bridge no-ops, game works exactly as today.
 *
 * No thrown errors; no blocked renders; no console.error spam.
 */

import { useEffect } from 'react'
import { getAnonId } from '@/lib/anonId'
import { saveJSON } from '@/lib/persist'
import { useGameStore } from '@/state/gameStore'
import { useAgencyStore } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { useStoryStore } from '@/state/storyStore'

// ── localStorage keys for the 4 zustand stores + 2 flat keys ────────────────
const FLEET_KEY = 'hyperion-fleet-v1'
const AGENCY_KEY = 'hyperion-agency-v1'
const CONTRACTS_KEY = 'hyperion-contracts-v1'
const STORY_KEY = 'hyperion-story-v1'
const PROFILE_KEY = 'hyperion-profile-v1'
const ONBOARDED_KEY = 'hyperion-onboarded-v1'

// ── Debounce helper ──────────────────────────────────────────────────────────
function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: T) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }
}

// ── Fire-and-forget save to server (never throws, never blocks) ──────────────
function serverSave(key: string, data: unknown, anonId: string): void {
  if (!anonId) return
  fetch('/api/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-anon-id': anonId,
    },
    body: JSON.stringify({ key, data }),
  }).catch(() => {
    // Network / DB failure: localStorage is already the local mirror. No-op.
  })
}

// ── Read the current persisted slice for each store (mirrors saveJSON calls) ─
// These shapes must exactly match what each store passes to saveJSON so the
// server round-trip is idempotent with the local mirror.

function gameSnapshot() {
  const s = useGameStore.getState()
  return { satellites: s.satellites, lastConjunctionAt: s.lastConjunctionAt }
}

function agencySnapshot() {
  const s = useAgencyStore.getState()
  return {
    founded: s.founded,
    name: s.name,
    emblemId: s.emblemId,
    colorway: s.colorway,
    funding: s.funding,
    reputation: s.reputation,
    leaning: s.leaning,
    milestones: s.milestones,
    reliefEmergencyUsed: s.reliefEmergencyUsed,
    refuelEfficiencyLevel: s.refuelEfficiencyLevel,
  }
}

function contractSnapshot() {
  const s = useContractStore.getState()
  return { contracts: s.contracts, targetId: s.targetId }
}

function storySnapshot() {
  const s = useStoryStore.getState()
  return { arcs: s.arcs, dispatches: s.dispatches, lastStoryAt: s.lastStoryAt, rival: s.rival }
}

// ── The Bridge component ─────────────────────────────────────────────────────

export function PersistBridge() {
  useEffect(() => {
    const anonId = getAnonId()

    // If we can't identify this device, skip the server round-trip entirely.
    if (!anonId) return

    let cancelled = false

    // ── 1. Hydrate from server ───────────────────────────────────────────────
    const load = async () => {
      try {
        const res = await fetch('/api/load', {
          headers: { 'x-anon-id': anonId },
        })
        if (cancelled) return

        if (!res.ok) {
          // HTTP error level (shouldn't happen — routes are ALWAYS-200, but guard it).
          console.debug('[PersistBridge] /api/load returned non-200; using local saves')
          return
        }

        const json = (await res.json()) as { ok: boolean; saves?: { key: string; data: unknown }[] }

        if (!json.ok || !Array.isArray(json.saves) || json.saves.length === 0) {
          // DB unavailable or no server saves yet — keep running from localStorage.
          return
        }

        // Build a quick lookup by store key.
        const serverSaves = new Map<string, unknown>(
          json.saves.map((row) => [row.key, row.data]),
        )

        // For each store: if the server has data for it, write to localStorage
        // then re-call the store's own hydrate() so back-compat normalisation runs.

        if (serverSaves.has(FLEET_KEY)) {
          saveJSON(FLEET_KEY, serverSaves.get(FLEET_KEY))
          useGameStore.getState().hydrate()
        }

        if (serverSaves.has(AGENCY_KEY)) {
          saveJSON(AGENCY_KEY, serverSaves.get(AGENCY_KEY))
          useAgencyStore.getState().hydrate()
        }

        if (serverSaves.has(CONTRACTS_KEY)) {
          saveJSON(CONTRACTS_KEY, serverSaves.get(CONTRACTS_KEY))
          useContractStore.getState().hydrate()
        }

        if (serverSaves.has(STORY_KEY)) {
          saveJSON(STORY_KEY, serverSaves.get(STORY_KEY))
          useStoryStore.getState().hydrate()
        }

        // profile + onboarded are flat localStorage values, not zustand stores.
        // Write the server data directly; the next profile/walkthrough read picks it up.
        if (serverSaves.has(PROFILE_KEY)) {
          saveJSON(PROFILE_KEY, serverSaves.get(PROFILE_KEY))
        }

        if (serverSaves.has(ONBOARDED_KEY)) {
          saveJSON(ONBOARDED_KEY, serverSaves.get(ONBOARDED_KEY))
        }
      } catch {
        // Network failure / JSON parse error — game keeps running from localStorage.
        console.debug('[PersistBridge] /api/load failed; using local saves')
      }
    }

    // ── 2. Arm write-through after load settles ──────────────────────────────
    const armWriteThrough = () => {
      if (cancelled) return

      // Debounce 800ms: only write after the store is quiet for a moment.
      const debouncedGame = debounce(() => {
        serverSave(FLEET_KEY, gameSnapshot(), anonId)
      }, 800)

      const debouncedAgency = debounce(() => {
        serverSave(AGENCY_KEY, agencySnapshot(), anonId)
      }, 800)

      const debouncedContracts = debounce(() => {
        serverSave(CONTRACTS_KEY, contractSnapshot(), anonId)
      }, 800)

      const debouncedStory = debounce(() => {
        serverSave(STORY_KEY, storySnapshot(), anonId)
      }, 800)

      // zustand subscribe returns an unsubscribe function.
      const unsubGame = useGameStore.subscribe(debouncedGame)
      const unsubAgency = useAgencyStore.subscribe(debouncedAgency)
      const unsubContracts = useContractStore.subscribe(debouncedContracts)
      const unsubStory = useStoryStore.subscribe(debouncedStory)

      // Return cleanup so useEffect can unsubscribe on unmount.
      return () => {
        unsubGame()
        unsubAgency()
        unsubContracts()
        unsubStory()
      }
    }

    // Run: hydrate first, then arm write-through regardless of outcome.
    let cleanup: (() => void) | undefined
    load().finally(() => {
      if (!cancelled) {
        cleanup = armWriteThrough()
      }
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, []) // run once on mount

  return null // pure side-effect component
}
