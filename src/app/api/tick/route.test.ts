/**
 * route.test.ts — Unit tests for /api/tick auth gate and resilience.
 *
 * We test the route handler directly (no HTTP server needed).
 * All external I/O is mocked so this runs in CI with no DB / cron secret.
 *
 * Covers:
 *  1. No CRON_SECRET set → returns {ok:false, reason:'cron disabled'} (200)
 *  2. CRON_SECRET set but Authorization header missing → 401 {ok:false}
 *  3. CRON_SECRET set but wrong bearer → 401 {ok:false}
 *  4. Correct bearer, DB unavailable → 200 {ok:false, reason:'db unavailable'}
 *  5. Correct bearer, DB returns empty owner list → 200 {ok:true, processed:0, skipped:0}
 *  6. Correct bearer, unfounded owner → skipped (processed:0, skipped:1)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock all external I/O before importing the route ─────────────────────────

vi.mock('@/lib/db', () => ({
  DbUnavailableError: class DbUnavailableError extends Error {
    constructor(msg = 'db unavailable') { super(msg); this.name = 'DbUnavailableError' }
  },
  dueOwnersForTick: vi.fn(),
  loadOwnerState: vi.fn(),
  writeOwnerState: vi.fn(),
}))

vi.mock('@/lib/eventsSource', () => ({
  fetchWorldEvents: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/worldTick', () => ({
  advanceWorld: vi.fn().mockReturnValue({
    next: { agency: {}, fleet: [], contracts: [], story: { arcs: [], dispatches: [], rival: {} } },
    digest: { atSim: 0, contractsExpired: [], rivalClaimed: [], newOffers: 0, arcBeat: null, dispatches: [] },
  }),
}))

// Import mocks + route AFTER vi.mock calls
import * as db from '@/lib/db'
import { GET } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/tick', {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

async function parseResponse(res: Response): Promise<{ status: number; body: unknown }> {
  const body = await res.json()
  return { status: res.status, body }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/api/tick auth gate', () => {
  const origCronSecret = process.env.CRON_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore env var
    if (origCronSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = origCronSecret
    }
  })

  it('1. returns {ok:false, reason:"cron disabled"} (200) when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET
    const { status, body } = await parseResponse(await GET(makeRequest()))
    expect(status).toBe(200)
    expect(body).toMatchObject({ ok: false, reason: 'cron disabled' })
  })

  it('2. returns 401 when CRON_SECRET is set but Authorization header is missing', async () => {
    process.env.CRON_SECRET = 'test-secret-abc'
    const { status, body } = await parseResponse(await GET(makeRequest()))
    expect(status).toBe(401)
    expect(body).toMatchObject({ ok: false, reason: 'unauthorized' })
  })

  it('3. returns 401 when CRON_SECRET is set but bearer is wrong', async () => {
    process.env.CRON_SECRET = 'test-secret-abc'
    const { status, body } = await parseResponse(await GET(makeRequest('Bearer wrong-secret')))
    expect(status).toBe(401)
    expect(body).toMatchObject({ ok: false, reason: 'unauthorized' })
  })

  it('4. returns {ok:false, reason:"db unavailable"} (200) when DB throws DbUnavailableError', async () => {
    process.env.CRON_SECRET = 'test-secret-abc'
    const { DbUnavailableError } = await import('@/lib/db')
    vi.mocked(db.dueOwnersForTick).mockRejectedValueOnce(new DbUnavailableError())
    const { status, body } = await parseResponse(
      await GET(makeRequest('Bearer test-secret-abc')),
    )
    expect(status).toBe(200)
    expect(body).toMatchObject({ ok: false, reason: 'db unavailable' })
  })

  it('5. returns {ok:true, processed:0, skipped:0} when no owners are due', async () => {
    process.env.CRON_SECRET = 'test-secret-abc'
    vi.mocked(db.dueOwnersForTick).mockResolvedValueOnce([])
    const { status, body } = await parseResponse(
      await GET(makeRequest('Bearer test-secret-abc')),
    )
    expect(status).toBe(200)
    expect(body).toMatchObject({ ok: true, processed: 0, skipped: 0 })
  })

  it('6. skips an unfounded owner (loadOwnerState returns null) without crashing', async () => {
    process.env.CRON_SECRET = 'test-secret-abc'
    vi.mocked(db.dueOwnersForTick).mockResolvedValueOnce(['owner-unfounded'])
    vi.mocked(db.loadOwnerState).mockResolvedValueOnce(null)
    const { status, body } = await parseResponse(
      await GET(makeRequest('Bearer test-secret-abc')),
    )
    expect(status).toBe(200)
    expect(body).toMatchObject({ ok: true, processed: 0, skipped: 1 })
  })
})
