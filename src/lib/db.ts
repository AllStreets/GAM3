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
] as const

export type StoreKey = (typeof STORE_KEYS)[number]

/** Returns true only for the six known store keys. */
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
 * Creates the `saves` table if it does not already exist.
 * Idempotent — safe to call on every request.
 * Throws DbUnavailableError when the database is not configured.
 */
export async function ensureSchema(): Promise<void> {
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
