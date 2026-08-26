/**
 * GET /api/load
 *
 * Owner id is taken from the `x-anon-id` request header (preferred)
 * or the `anonId` query param (fallback for environments where custom
 * headers on GET requests are awkward).
 *
 * ALWAYS returns HTTP 200 with JSON:
 *   { ok: true,  saves: { key: string, data: unknown }[] }  — success
 *   { ok: false, reason: string, saves: [] }                — any error
 *
 * Secrets are never logged. No DB required at build / import time.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ensureSchema, loadSaves, DbUnavailableError } from '@/lib/db'

// Run in the Node.js runtime (Neon driver requires Node — not Edge).
export const runtime = 'nodejs'
// Always handle at request time — reads the x-anon-id header.
export const dynamic = 'force-dynamic'

const MAX_ANON_ID_LEN = 128

type SaveRow = { key: string; data: unknown }

function ok(saves: SaveRow[]): Response {
  return Response.json({ ok: true, saves })
}

function err(reason: string): Response {
  return Response.json({ ok: false, reason, saves: [] })
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // --- owner id: Clerk userId if signed in, else header/query param ---
    const { userId: clerkUserId } = await auth()

    const headerId = request.headers.get('x-anon-id')
    const { searchParams } = new URL(request.url)
    const queryId = searchParams.get('anonId')

    const ownerId = (clerkUserId ?? headerId ?? queryId ?? '').trim()

    if (!ownerId) {
      return err('missing owner id (sign in, x-anon-id header, or anonId query param)')
    }
    if (ownerId.length > MAX_ANON_ID_LEN) {
      return err('owner id too long')
    }

    // --- fetch saves ---
    await ensureSchema()
    const saves = await loadSaves(ownerId)

    return ok(saves)
  } catch (e) {
    if (e instanceof DbUnavailableError) {
      return err('database not available')
    }
    console.error('[/api/load] unexpected error:', e instanceof Error ? e.message : String(e))
    return err('internal error')
  }
}
