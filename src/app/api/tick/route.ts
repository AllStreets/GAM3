/**
 * /api/tick — Cron-protected offline world-advance route.
 *
 * Called every 20 minutes by Vercel Cron. Vercel injects
 * `Authorization: Bearer $CRON_SECRET` on each invocation.
 *
 * Security:
 *  - If CRON_SECRET is unset → cron is "disabled"; return {ok:false, reason:'cron disabled'}.
 *  - If CRON_SECRET is set but the request lacks the correct Bearer → 401 {ok:false, reason:'unauthorized'}.
 *  - The secret is never logged.
 *
 * Resilience (ALWAYS-safe):
 *  - Per-owner try/catch: one owner failure never aborts the run.
 *  - DbUnavailableError or any top-level error → 200 {ok:false, reason} (never 500/throw).
 *  - No CRON_SECRET / no DB → the game plays exactly as before (static world).
 *
 * Live-session safety:
 *  - Owners whose saves were updated within the last 300 seconds are skipped
 *    (they are in an active session; their client state is live).
 */

import { NextResponse } from 'next/server'
import { orbitalPeriod } from '@/lib/orbits'
import { simNow, TIME_SCALE } from '@/lib/simTime'
import {
  DbUnavailableError,
  dueOwnersForTick,
  loadOwnerState,
  writeOwnerState,
} from '@/lib/db'
import { fetchWorldEvents } from '@/lib/eventsSource'
import { advanceWorld } from '@/lib/worldTick'

// Route segment config for Next.js 16:
// - runtime: 'nodejs' is the default but we make it explicit for clarity.
// - dynamic: 'force-dynamic' ensures this route is never statically cached.
//   (dynamic is still valid in Next 16 when cacheComponents is NOT enabled.)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Approximate sim-second period for a 500 km LEO orbit. */
const PERIOD_SEC = orbitalPeriod((6371 + 500) / 6371)

/** Skip owners who saved within this many wall-clock seconds (they are live). */
const ACTIVE_WITHIN_SEC = 300

/** Maximum owners processed per tick (keeps wall-time bounded). */
const OWNER_CAP = 50

/**
 * Minimum sim-second interval between ticks for the same owner.
 * Cron runs every 20 wall-minutes → 20 × 60 × TIME_SCALE sim-seconds.
 * We use 80 % of that so a slightly-early cron fire doesn't skip everyone.
 */
const MIN_TICK_INTERVAL_SIM = Math.floor(20 * 60 * TIME_SCALE * 0.8)

export async function GET(request: Request): Promise<NextResponse> {
  // ── 1. Auth ──────────────────────────────────────────────────────────────────

  const cronSecret = process.env.CRON_SECRET

  // If CRON_SECRET is not configured, the cron is treated as disabled.
  // This allows the game to run locally and in preview without a cron.
  if (!cronSecret) {
    return NextResponse.json({ ok: false, reason: 'cron disabled' }, { status: 200 })
  }

  const authHeader = request.headers.get('authorization')
  const expectedBearer = `Bearer ${cronSecret}`

  // Constant-time comparison is not strictly needed here (both sides are
  // already server-only), but we avoid logging either value.
  if (authHeader !== expectedBearer) {
    return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
  }

  // ── 2. Tick logic ─────────────────────────────────────────────────────────────

  try {
    const nowSim = simNow()

    // Fetch events (catch → return [] so a feed outage doesn't block the tick)
    let events: Awaited<ReturnType<typeof fetchWorldEvents>> = []
    try {
      events = await fetchWorldEvents()
    } catch {
      // Events unavailable — tick still runs; board may not refresh, but that's safe.
      events = []
    }

    // Find offline owners due for a tick (max OWNER_CAP per run).
    // Gates: offline (not saved within ACTIVE_WITHIN_SEC) AND not ticked within
    // MIN_TICK_INTERVAL_SIM sim-seconds (prevents double-tick on the same owner).
    const owners = await dueOwnersForTick(ACTIVE_WITHIN_SEC, OWNER_CAP, nowSim, MIN_TICK_INTERVAL_SIM)

    let processed = 0
    let skipped = 0

    for (const ownerId of owners) {
      try {
        // Load and assemble WorldState from persisted blobs
        const ownerState = await loadOwnerState(ownerId)

        if (!ownerState) {
          // Agency not yet founded → skip silently
          skipped++
          continue
        }

        const { agency, fleet, contracts, story, _fleetBlob, _contractsBlob, _storyBlob } =
          ownerState

        // Advance the world (pure, deterministic)
        const { next, digest } = advanceWorld(
          { agency, fleet, contracts, story },
          { nowSim, events, periodSec: PERIOD_SEC },
        )

        // Only write if something changed (saves DB writes for quiet ticks)
        const hasChanges =
          digest.contractsExpired.length > 0 ||
          digest.rivalClaimed.length > 0 ||
          digest.newOffers > 0 ||
          digest.arcBeat !== null ||
          digest.dispatches.length > 0

        if (hasChanges) {
          await writeOwnerState(ownerId, next, digest, nowSim, {
            _fleetBlob,
            _contractsBlob,
            _storyBlob,
          })
        }

        processed++
      } catch {
        // Per-owner isolation: one owner failure must not abort the whole run.
        skipped++
      }
    }

    return NextResponse.json({ ok: true, processed, skipped }, { status: 200 })
  } catch (err: unknown) {
    // Top-level catch: DbUnavailableError or unexpected error.
    // ALWAYS return 200-style {ok:false} so Vercel Cron doesn't retry aggressively.
    const reason =
      err instanceof DbUnavailableError
        ? 'db unavailable'
        : 'internal error'

    return NextResponse.json({ ok: false, reason }, { status: 200 })
  }
}
