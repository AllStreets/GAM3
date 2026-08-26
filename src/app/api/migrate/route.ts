/**
 * POST /api/migrate
 *
 * Migrates anonymous saves to the signed-in user's account.
 *
 * Header: x-anon-id — the anonymous device UUID (source)
 * Auth:   Clerk userId (destination) — derived server-side via auth()
 *
 * Strategy (no-clobber):
 *   - If the user already has saves → returns { ok: true, migrated: false }
 *   - If the user has no saves → copies anon rows to the user
 *
 * ALWAYS returns HTTP 200.
 *   { ok: true, migrated: boolean }   — success
 *   { ok: false, reason: string }     — any error
 *
 * Requires the user to be signed in. If not signed in, returns ok:false
 * (the client guards this, but defence-in-depth here).
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ensureSchema, migrateSaves, DbUnavailableError } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_ANON_ID_LEN = 128

function ok(migrated: boolean): Response {
  return Response.json({ ok: true, migrated })
}

function err(reason: string): Response {
  return Response.json({ ok: false, reason })
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // --- Must be signed in ---
    const { userId } = await auth()
    if (!userId) {
      return err('not signed in')
    }

    // --- Anon source from header ---
    const anonId = (request.headers.get('x-anon-id') ?? '').trim()
    if (!anonId) {
      return err('missing x-anon-id header')
    }
    if (anonId.length > MAX_ANON_ID_LEN) {
      return err('x-anon-id too long')
    }

    // --- Guard against migrating to self (sanity check) ---
    if (anonId === userId) {
      return ok(false)
    }

    // --- Migrate ---
    await ensureSchema()
    const { migrated } = await migrateSaves(anonId, userId)

    return ok(migrated)
  } catch (e) {
    if (e instanceof DbUnavailableError) {
      return err('database not available')
    }
    console.error('[/api/migrate] unexpected error:', e instanceof Error ? e.message : String(e))
    return err('internal error')
  }
}
