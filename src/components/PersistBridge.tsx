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
 *   3. When the user becomes signed in (Clerk isSignedIn changes true): POST
 *      /api/migrate once to adopt anon saves into the account, then re-hydrate
 *      from the server so account saves load.
 *
 * Failure contract (always-degrade):
 *   - /api/load fails → skip injection, arm write-through, game runs from local.
 *   - /api/save fails → silently ignored; localStorage is already the local mirror.
 *   - /api/migrate fails → silently ignored; anon saves are still in the DB.
 *   - No DB / anonId unavailable → same: bridge no-ops, game works exactly as today.
 *   - Clerk not loaded / unavailable → same degradation, isSignedIn stays undefined.
 *
 * No thrown errors; no blocked renders; no console.error spam.
 */

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { getAnonId } from '@/lib/anonId'
import { saveJSON } from '@/lib/persist'
import { markSynced, markOffline } from '@/lib/persistStatus'
import { setDigest, hasDigestChanges } from '@/lib/worldDigest'
import type { WorldDigest } from '@/lib/worldTick'
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
const WORLD_DIGEST_KEY = 'hyperion-worlddigest-v1'

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
  }).then((res) => {
    if (res.ok) markSynced()
    else markOffline()
  }).catch(() => {
    // Network / DB failure: localStorage is already the local mirror. No-op.
    markOffline()
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

// ── Hydrate stores from a server-save map ────────────────────────────────────
function applyServerSaves(saves: { key: string; data: unknown }[]): void {
  const serverSaves = new Map<string, unknown>(saves.map((row) => [row.key, row.data]))

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
  if (serverSaves.has(PROFILE_KEY)) {
    saveJSON(PROFILE_KEY, serverSaves.get(PROFILE_KEY))
  }
  if (serverSaves.has(ONBOARDED_KEY)) {
    saveJSON(ONBOARDED_KEY, serverSaves.get(ONBOARDED_KEY))
  }

  // ── WorldDigest: surface it via the worldDigest signal store ──────────────
  // Only expose if it has actual changes (non-empty expired/claimed/offers/arc/dispatches).
  if (serverSaves.has(WORLD_DIGEST_KEY)) {
    const raw = serverSaves.get(WORLD_DIGEST_KEY) as WorldDigest | null | undefined
    if (
      raw &&
      typeof raw === 'object' &&
      typeof raw.atSim === 'number' &&
      hasDigestChanges(raw)
    ) {
      setDigest(raw)
    }
  }
}

// ── Fetch saves from server and apply them ───────────────────────────────────
async function hydrateFromServer(anonId: string): Promise<void> {
  try {
    const res = await fetch('/api/load', {
      headers: { 'x-anon-id': anonId },
    })
    if (!res.ok) { markOffline(); return }

    const json = (await res.json()) as { ok: boolean; saves?: { key: string; data: unknown }[] }
    if (!json.ok) { markOffline(); return }

    markSynced()
    if (!Array.isArray(json.saves) || json.saves.length === 0) return

    applyServerSaves(json.saves)
  } catch {
    // Network failure — keep running from localStorage.
    markOffline()
    console.debug('[PersistBridge] /api/load failed; using local saves')
  }
}

// ── The Bridge component ─────────────────────────────────────────────────────

export function PersistBridge() {
  // Clerk's useAuth: isLoaded=false until Clerk initialises, safe in SSR.
  // If Clerk fails to init, isLoaded stays false and isSignedIn stays undefined.
  const { isLoaded: clerkLoaded, isSignedIn, userId: clerkUserId } = useAuth()

  // Track whether we've run migration for this sign-in session (guard once-per-sign-in).
  const migratedRef = useRef(false)
  // Track whether the previous Clerk state was signed-out so we detect the transition.
  const prevSignedInRef = useRef<boolean | undefined>(undefined)

  // ── Initial mount: hydrate from server (anon path) + arm write-through ──
  useEffect(() => {
    const anonId = getAnonId()
    if (!anonId) return

    let cancelled = false

    // ── 1. Hydrate from server ───────────────────────────────────────────────
    const load = async () => {
      if (!cancelled) await hydrateFromServer(anonId)
    }

    // ── 2. Arm write-through after load settles ──────────────────────────────
    const armWriteThrough = () => {
      if (cancelled) return

      // Use anonId for write-through header; the server will substitute
      // clerkUserId server-side when the user is signed in.
      const debouncedGame = debounce(() => { serverSave(FLEET_KEY, gameSnapshot(), anonId) }, 800)
      const debouncedAgency = debounce(() => { serverSave(AGENCY_KEY, agencySnapshot(), anonId) }, 800)
      const debouncedContracts = debounce(() => { serverSave(CONTRACTS_KEY, contractSnapshot(), anonId) }, 800)
      const debouncedStory = debounce(() => { serverSave(STORY_KEY, storySnapshot(), anonId) }, 800)

      const unsubGame = useGameStore.subscribe(debouncedGame)
      const unsubAgency = useAgencyStore.subscribe(debouncedAgency)
      const unsubContracts = useContractStore.subscribe(debouncedContracts)
      const unsubStory = useStoryStore.subscribe(debouncedStory)

      return () => { unsubGame(); unsubAgency(); unsubContracts(); unsubStory() }
    }

    let cleanup: (() => void) | undefined
    load().finally(() => {
      if (!cancelled) cleanup = armWriteThrough()
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, []) // run once on mount

  // ── Migration effect: fires when Clerk signs the user in ────────────────────
  useEffect(() => {
    // Wait for Clerk to finish loading before checking state.
    if (!clerkLoaded) return

    const nowSignedIn = isSignedIn === true
    const wasSignedIn = prevSignedInRef.current

    // Detect the transition from signed-out/unknown to signed-in.
    const justSignedIn = nowSignedIn && !wasSignedIn

    prevSignedInRef.current = nowSignedIn

    if (!justSignedIn) return
    if (migratedRef.current) return // already migrated in this session

    migratedRef.current = true

    const anonId = getAnonId()
    if (!anonId || !clerkUserId) return

    // Fire-and-forget: migrate anon saves → account, then re-hydrate.
    const migrate = async () => {
      try {
        await fetch('/api/migrate', {
          method: 'POST',
          headers: { 'x-anon-id': anonId },
        })
        // Re-hydrate from server: account saves now load (or were already there).
        await hydrateFromServer(anonId)
      } catch {
        // Network / DB failure — session continues from localStorage.
        markOffline()
        console.debug('[PersistBridge] migration failed; using local saves')
      }
    }

    migrate()
  }, [clerkLoaded, isSignedIn, clerkUserId])

  return null // pure side-effect component
}
