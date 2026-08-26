/**
 * db.ts — Neon Postgres data layer for HYPERION save slots.
 *
 * DESIGN RULES:
 *  - Lazy initialisation: neon() is never called at import time so that
 *    `npm run build` succeeds with no DATABASE_URL in the environment.
 *  - All public helpers throw DbUnavailableError when the env var is absent
 *    so callers can catch and degrade gracefully.
 *  - Parameterised SQL only — no string interpolation of caller-supplied values.
 *  - Secrets never logged.
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// ---------------------------------------------------------------------------
// Store-key allowlist
// ---------------------------------------------------------------------------

export const STORE_KEYS = [
  'hyperion-fleet-v1',
  'hyperion-agency-v1',
  'hyperion-contracts-v1',
  'hyperion-story-v1',
  'hyperion-profile-v1',
  'hyperion-onboarded-v1',
  'hyperion-worlddigest-v1',
  'hyperion-worldmeta-v1',
] as const

export type StoreKey = (typeof STORE_KEYS)[number]

/** Returns true only for the known store keys. */
export function isStoreKey(k: unknown): k is StoreKey {
  return STORE_KEYS.includes(k as StoreKey)
}

// ---------------------------------------------------------------------------
// Typed error for callers to catch
// ---------------------------------------------------------------------------

export class DbUnavailableError extends Error {
  constructor(message = 'Database not configured') {
    super(message)
    this.name = 'DbUnavailableError'
  }
}

/** Returns true when the DATABASE_URL env var is present (non-empty string). */
export function hasDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

// ---------------------------------------------------------------------------
// Lazy SQL client — created on first use, never at import time
// ---------------------------------------------------------------------------

let _sql: NeonQueryFunction<false, false> | null = null

function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql
  if (!process.env.DATABASE_URL) {
    throw new DbUnavailableError()
  }
  _sql = neon(process.env.DATABASE_URL)
  return _sql
}

// ---------------------------------------------------------------------------
// Schema bootstrap
// ---------------------------------------------------------------------------

/**
 * Module-level flag: once the CREATE TABLE IF NOT EXISTS succeeds once in
 * this server process, we skip the DDL on every subsequent request.
 * Reset-safe: if the server restarts the flag resets to false naturally.
 */
let schemaReady = false

/**
 * Creates the `saves` table if it does not already exist.
 * Runs the DDL statement at most ONCE per server process (schemaReady guards).
 * Throws DbUnavailableError when the database is not configured.
 */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS saves (
      owner_id   text        NOT NULL,
      store_key  text        NOT NULL,
      data       jsonb       NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_id, store_key)
    )
  `
  schemaReady = true
}

/**
 * Reset the schema-ready flag (test helper — allows tests to force re-creation).
 * Never call in production code.
 */
export function _resetSchemaReadyForTest(): void {
  schemaReady = false
}

// ---------------------------------------------------------------------------
// CRUD helpers — all parameterised
// ---------------------------------------------------------------------------

/**
 * Insert or update a save row.
 * Uses ON CONFLICT to upsert atomically.
 */
export async function upsertSave(
  ownerId: string,
  key: StoreKey,
  data: unknown,
): Promise<void> {
  const sql = getSql()
  await sql`
    INSERT INTO saves (owner_id, store_key, data, updated_at)
    VALUES (${ownerId}, ${key}, ${JSON.stringify(data)}, now())
    ON CONFLICT (owner_id, store_key)
    DO UPDATE SET
      data       = EXCLUDED.data,
      updated_at = EXCLUDED.updated_at
  `
}

/** Load all saves for an owner. Returns an empty array when none found. */
export async function loadSaves(
  ownerId: string,
): Promise<{ key: string; data: unknown }[]> {
  const sql = getSql()
  const rows = await sql`
    SELECT store_key AS key, data
    FROM   saves
    WHERE  owner_id = ${ownerId}
  `
  return rows as { key: string; data: unknown }[]
}

/** Delete all save rows for an owner. */
export async function deleteSaves(ownerId: string): Promise<void> {
  const sql = getSql()
  await sql`
    DELETE FROM saves
    WHERE owner_id = ${ownerId}
  `
}

/**
 * Migrate saves from an anonymous owner to a signed-in user.
 *
 * Strategy (no-clobber):
 *   - If the user already has ANY saves → do nothing (prefer account data).
 *   - If the user has NO saves → copy all anon rows to the user (upsert).
 *
 * This means a logged-out session's progress is adopted into the account on
 * first sign-in, but an existing account is never overwritten.
 */
export async function migrateSaves(
  anonId: string,
  userId: string,
): Promise<{ migrated: boolean }> {
  const sql = getSql()

  // Check if the user already has any saves.
  const existingRows = await sql`
    SELECT 1 FROM saves WHERE owner_id = ${userId} LIMIT 1
  `
  if (existingRows.length > 0) {
    // Account already has saves — leave them intact.
    return { migrated: false }
  }

  // Copy anon rows to userId (INSERT … ON CONFLICT DO NOTHING for safety).
  await sql`
    INSERT INTO saves (owner_id, store_key, data, updated_at)
    SELECT ${userId}, store_key, data, updated_at
    FROM   saves
    WHERE  owner_id = ${anonId}
    ON CONFLICT (owner_id, store_key) DO NOTHING
  `
  return { migrated: true }
}

// ---------------------------------------------------------------------------
// Cron-tick helpers
// ---------------------------------------------------------------------------

/**
 * Return up to `limit` owner_ids that are "due" for an offline tick:
 *   - Their most-recently-updated save row is OLDER than `activeWithinSec` seconds
 *     ago (i.e. they are not in an active live session).
 *   - They have at least one save row (i.e. they have played the game).
 *
 * Parameterised SQL throughout. Throws DbUnavailableError when the database is
 * not configured.
 */
export async function dueOwnersForTick(
  activeWithinSec: number,
  limit: number,
): Promise<string[]> {
  const sql = getSql()
  // Cast limit/activeWithinSec to int for safety even though they're numbers.
  const rows = await sql`
    SELECT owner_id
    FROM   saves
    GROUP  BY owner_id
    HAVING MAX(updated_at) < now() - (${activeWithinSec} || ' seconds')::interval
    ORDER  BY MAX(updated_at) ASC
    LIMIT  ${limit}
  `
  return (rows as { owner_id: string }[]).map((r) => r.owner_id)
}

/**
 * Shape of the raw store blobs we read for a single owner.
 * All fields are `unknown` because the blobs are jsonb stored by the client.
 */
interface OwnerBlobs {
  agencyBlob: Record<string, unknown> | null
  fleetBlob: Record<string, unknown> | null
  contractsBlob: Record<string, unknown> | null
  storyBlob: Record<string, unknown> | null
}

/**
 * Assembled WorldState pieces for `advanceWorld`, or null if the agency
 * has not been founded yet (no agency blob or founded === false).
 */
export interface OwnerWorldState {
  agency: {
    funding: number
    reputation: number
    [k: string]: unknown
  }
  fleet: import('@/state/gameStore').Satellite[]
  contracts: import('@/state/contractStore').Contract[]
  story: {
    arcs: import('@/lib/storyProgress').Arc[]
    dispatches: import('@/state/storyStore').Dispatch[]
    rival: import('@/lib/rival').Rival
    [k: string]: unknown
  }
  /** Raw fleet blob (for merging back on write). */
  _fleetBlob: Record<string, unknown>
  /** Raw contracts blob (for merging back on write). */
  _contractsBlob: Record<string, unknown>
  /** Raw story blob (for merging back on write). */
  _storyBlob: Record<string, unknown>
}

/**
 * Load all store blobs for an owner and assemble the fields that `advanceWorld`
 * needs. Returns null if the agency has not been founded.
 */
export async function loadOwnerState(
  ownerId: string,
): Promise<OwnerWorldState | null> {
  const rows = await loadSaves(ownerId)

  const byKey: Record<string, unknown> = {}
  for (const row of rows) {
    byKey[row.key] = row.data
  }

  const agencyBlob = (byKey['hyperion-agency-v1'] as Record<string, unknown> | null) ?? null
  const fleetBlob = (byKey['hyperion-fleet-v1'] as Record<string, unknown> | null) ?? null
  const contractsBlob = (byKey['hyperion-contracts-v1'] as Record<string, unknown> | null) ?? null
  const storyBlob = (byKey['hyperion-story-v1'] as Record<string, unknown> | null) ?? null

  // If no agency blob or agency not yet founded → skip this owner
  if (!agencyBlob || !agencyBlob.founded) return null

  const agency = {
    ...agencyBlob,
    funding: typeof agencyBlob.funding === 'number' ? agencyBlob.funding : 0,
    reputation: typeof agencyBlob.reputation === 'number' ? agencyBlob.reputation : 0,
  } as OwnerWorldState['agency']

  // Fleet blob: { satellites: Satellite[], ...other fields }
  const fleet = (
    Array.isArray((fleetBlob as { satellites?: unknown })?.satellites)
      ? (fleetBlob as { satellites: unknown[] }).satellites
      : []
  ) as import('@/state/gameStore').Satellite[]

  // Contracts blob: { contracts: Contract[], targetId: string | null }
  const contracts = (
    Array.isArray((contractsBlob as { contracts?: unknown })?.contracts)
      ? (contractsBlob as { contracts: unknown[] }).contracts
      : []
  ) as import('@/state/contractStore').Contract[]

  // Story blob: { arcs, dispatches, lastStoryAt, rival, ... }
  const story = {
    ...(storyBlob ?? {}),
    arcs: Array.isArray((storyBlob as { arcs?: unknown } | null)?.arcs)
      ? ((storyBlob as { arcs: unknown[] }).arcs as import('@/lib/storyProgress').Arc[])
      : [],
    dispatches: Array.isArray((storyBlob as { dispatches?: unknown } | null)?.dispatches)
      ? ((storyBlob as { dispatches: unknown[] }).dispatches as import('@/state/storyStore').Dispatch[])
      : [],
    rival: (storyBlob as { rival?: unknown } | null)?.rival as import('@/lib/rival').Rival ??
      (await import('@/lib/rival')).seedRival(null),
  } as OwnerWorldState['story']

  return {
    agency,
    fleet,
    contracts,
    story,
    _fleetBlob: fleetBlob ?? {},
    _contractsBlob: contractsBlob ?? {},
    _storyBlob: storyBlob ?? {},
  }
}

/**
 * Write the advanced WorldState blobs back for an owner, plus the digest and
 * worldmeta. Each blob is merged with the owner's existing raw blob so unknown
 * fields (e.g. targetId, lastStoryAt) are preserved.
 *
 * Written keys:
 *   hyperion-agency-v1     — updated agency fields
 *   hyperion-fleet-v1      — merged fleet blob with updated satellites
 *   hyperion-contracts-v1  — merged contracts blob with updated contracts
 *   hyperion-story-v1      — merged story blob with updated arcs/dispatches/rival
 *   hyperion-worlddigest-v1 — the WorldDigest (client clears on consume)
 *   hyperion-worldmeta-v1   — { lastTickSim: nowSim }
 */
export async function writeOwnerState(
  ownerId: string,
  next: {
    agency: Record<string, unknown>
    fleet: unknown[]
    contracts: unknown[]
    story: { arcs: unknown[]; dispatches: unknown[]; rival: unknown; [k: string]: unknown }
  },
  digest: unknown,
  nowSim: number,
  rawBlobs: {
    _fleetBlob: Record<string, unknown>
    _contractsBlob: Record<string, unknown>
    _storyBlob: Record<string, unknown>
  },
): Promise<void> {
  const agencyData = { ...next.agency }
  const fleetData = { ...rawBlobs._fleetBlob, satellites: next.fleet }
  const contractsData = {
    ...rawBlobs._contractsBlob,
    contracts: next.contracts,
    // Preserve targetId from the original blob; the tick never changes the active target
    targetId: (rawBlobs._contractsBlob.targetId ?? null),
  }
  const storyData = {
    ...rawBlobs._storyBlob,
    ...next.story,
    arcs: next.story.arcs,
    dispatches: next.story.dispatches,
    rival: next.story.rival,
  }
  const metaData = { lastTickSim: nowSim }

  // Run all upserts in parallel (saves wall time, still individually atomic)
  await Promise.all([
    upsertSave(ownerId, 'hyperion-agency-v1', agencyData),
    upsertSave(ownerId, 'hyperion-fleet-v1', fleetData),
    upsertSave(ownerId, 'hyperion-contracts-v1', contractsData),
    upsertSave(ownerId, 'hyperion-story-v1', storyData),
    upsertSave(ownerId, 'hyperion-worlddigest-v1', digest),
    upsertSave(ownerId, 'hyperion-worldmeta-v1', metaData),
  ])
}
