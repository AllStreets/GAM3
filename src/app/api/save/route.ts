/**
 * POST /api/save
 *
 * Body:   { key: string, data: unknown }
 * Header: x-anon-id — client-generated device UUID (Task 1 anonymous owner)
 *
 * ALWAYS returns HTTP 200 with JSON:
 *   { ok: true }                    — success
 *   { ok: false, reason: string }   — any error (bad input, DB down, …)
 *
 * Secrets are never logged. No DB required to import this module at build time.
 */

import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import {
  ensureSchema,
  upsertSave,
  isStoreKey,
  DbUnavailableError,
} from '@/lib/db'

// Run in the Node.js runtime (Neon driver requires Node — not Edge).
export const runtime = 'nodejs'
// Always handle this route at request time — never prerender / cache.
export const dynamic = 'force-dynamic'

/** Rough upper bounds to guard against oversized payloads / ids. */
const MAX_BODY_BYTES = 512 * 1024 // 512 KB
const MAX_ANON_ID_LEN = 128

function ok(): Response {
  return Response.json({ ok: true })
}

function err(reason: string): Response {
  return Response.json({ ok: false, reason })
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // --- owner id: Clerk userId if signed in, else x-anon-id header ---
    const { userId: clerkUserId } = await auth()
    const anonHeader = request.headers.get('x-anon-id')

    const ownerId = clerkUserId ?? (anonHeader?.trim() ?? '')

    if (!ownerId) {
      return err('missing owner id (sign in or provide x-anon-id header)')
    }
    if (ownerId.length > MAX_ANON_ID_LEN) {
      return err('owner id too long')
    }

    // --- body size guard ---
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return err('request body too large')
    }

    // --- parse body ---
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return err('invalid JSON body')
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return err('body must be a JSON object')
    }

    const { key, data } = body as Record<string, unknown>

    // --- validate store key ---
    if (!isStoreKey(key)) {
      return err('invalid store key')
    }

    // Additional payload size check after parse (handles chunked with no content-length)
    const serialised = JSON.stringify(data)
    if (serialised.length > MAX_BODY_BYTES) {
      return err('data payload too large')
    }

    // --- persist ---
    await ensureSchema()
    await upsertSave(ownerId, key, data)

    return ok()
  } catch (e) {
    if (e instanceof DbUnavailableError) {
      return err('database not available')
    }
    // Log the error class/message but NEVER log stack traces that might contain secrets.
    console.error('[/api/save] unexpected error:', e instanceof Error ? e.message : String(e))
    return err('internal error')
  }
}
