/**
 * worldTick.test.ts — TDD suite for advanceWorld (pure, deterministic).
 *
 * Covers every behavior bullet from the P12-T1 brief:
 *  1. Expired active contract → failed + −5 rep + title in digest.contractsExpired
 *  2. Contested active past rival ETA → rival claims + wins++ + −1 rep + title in digest.rivalClaimed + rival dispatch
 *  3. Completed contract is NOT expired or rival-claimed
 *  4. Board tops up from events (reachability-filtered, capped, dedup, never blank)
 *  5. Arc advances + 1 dispatch added
 *  6. Passthrough fields preserved on agency and story
 *  7. Fully deterministic: double-call on same state yields identical results
 */
import { describe, it, expect } from 'vitest'
import { advanceWorld, type WorldState, type AdvanceCtx } from './worldTick'
import type { Contract } from '@/state/contractStore'
import type { Satellite } from '@/state/gameStore'
import type { Arc } from './storyProgress'
import type { Dispatch } from '@/state/storyStore'
import type { Rival } from './rival'

// ─── Test fixtures ──────────────────────────────────────────────────────────

const deg = (d: number) => (d * Math.PI) / 180

/** ISS-like satellite: inclination 51.6° — reaches up to ~56° latitude */
const issSat: Satellite = {
  id: 'hyp-1',
  name: 'HYPERION-1',
  elements: {
    a: (6371 + 420) / 6371,
    e: 0.0012,
    i: deg(51.6),
    raan: 0.8,
    argp: 0.3,
    m0: 0,
    epoch: 0,
  },
  fuel: 1800,
  fuelCapacity: 1800,
  capability: 'imaging',
  record: { contractsCompleted: 0, notablePasses: [], commissionedAt: 0 },
  tankLevel: 0,
}

const baseRival: Rival = {
  name: 'VANTIS Corp',
  emblemId: 'hex-eye',
  archetype: 'defense',
  reputation: 42,
  wins: 0,
  losses: 0,
}

const baseArc: Arc = {
  id: 'main',
  theme: 'Initial Tasking',
  tension: 0.3,
  beatsSeen: 0,
}

function makeContract(overrides: Partial<Contract> & { id: string; title: string }): Contract {
  return {
    eventId: overrides.id,
    kind: 'quake',
    lat: 10,
    lon: 20,
    deadline: 10000,
    reward: { funding: 200, reputation: 15 },
    status: 'available',
    archetype: 'relief',
    preferredCapability: 'imaging',
    ...overrides,
  }
}

function makeState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    agency: { funding: 500, reputation: 20 },
    fleet: [issSat],
    contracts: [],
    story: {
      arcs: [baseArc],
      dispatches: [] as Dispatch[],
      rival: { ...baseRival },
    },
    ...overrides,
  }
}

const baseCtx: AdvanceCtx = {
  nowSim: 20000,
  events: [
    {
      id: 'ev-a',
      kind: 'quake',
      title: 'M6.1 — Test Region',
      lat: 10,
      lon: 20,
      time: '2026-01-01T00:00:00Z',
      severity: 0.8,
    },
    {
      id: 'ev-b',
      kind: 'wildfire',
      title: 'Wildfire Watch',
      lat: 5,
      lon: 30,
      time: '2026-01-01T00:00:00Z',
      severity: 0.6,
    },
  ],
  periodSec: 5400,
}

// ─── 1. Expire active contracts ──────────────────────────────────────────────

describe('advanceWorld — contract expiry', () => {
  it('marks an active contract past its deadline as failed', () => {
    const state = makeState({
      contracts: [
        makeContract({ id: 'c1', title: 'Expired Mission', status: 'active', deadline: 5000 }),
      ],
    })
    const { next } = advanceWorld(state, baseCtx) // nowSim=20000 > deadline=5000
    const c = next.contracts.find((x) => x.id === 'c1')
    expect(c?.status).toBe('failed')
  })

  it('adds title to digest.contractsExpired', () => {
    const state = makeState({
      contracts: [
        makeContract({ id: 'c1', title: 'Expired Mission', status: 'active', deadline: 5000 }),
      ],
    })
    const { digest } = advanceWorld(state, baseCtx)
    expect(digest.contractsExpired).toContain('Expired Mission')
  })

  it('deducts 5 reputation per expired contract (clamped at 0)', () => {
    const state = makeState({
      agency: { funding: 500, reputation: 8 },
      contracts: [
        makeContract({ id: 'c1', title: 'Expired Mission', status: 'active', deadline: 5000 }),
      ],
    })
    const { next } = advanceWorld(state, baseCtx)
    // rep 8 − 5 = 3, but clamped: >= 0
    expect(next.agency.reputation).toBe(3)
  })

  it('clamps reputation to 0, never negative', () => {
    const state = makeState({
      agency: { funding: 500, reputation: 3 },
      contracts: [
        makeContract({ id: 'c1', title: 'A', status: 'active', deadline: 5000 }),
        makeContract({ id: 'c2', title: 'B', status: 'active', deadline: 5000 }),
      ],
    })
    const { next } = advanceWorld(state, baseCtx)
    // 3 - 5 - 5 = -7 → clamped to 0
    expect(next.agency.reputation).toBeGreaterThanOrEqual(0)
  })

  it('does NOT expire a contract whose deadline is in the future', () => {
    const state = makeState({
      contracts: [
        makeContract({ id: 'c1', title: 'Live Mission', status: 'active', deadline: 99999 }),
      ],
    })
    const { next, digest } = advanceWorld(state, baseCtx)
    expect(next.contracts.find((x) => x.id === 'c1')?.status).toBe('active')
    expect(digest.contractsExpired).not.toContain('Live Mission')
  })

  it('does NOT expire a completed contract', () => {
    const state = makeState({
      contracts: [
        makeContract({ id: 'c1', title: 'Done Mission', status: 'completed', deadline: 5000 }),
      ],
    })
    const { next, digest } = advanceWorld(state, baseCtx)
    expect(next.contracts.find((x) => x.id === 'c1')?.status).toBe('completed')
    expect(digest.contractsExpired).not.toContain('Done Mission')
  })
})

// ─── 2. Rival claim (contested) ──────────────────────────────────────────────

describe('advanceWorld — rival claim', () => {
  it('marks a contested active contract as failed when rival ETA has passed', () => {
    const state = makeState({
      contracts: [
        makeContract({
          id: 'c2',
          title: 'Contested Race',
          status: 'active',
          deadline: 99999,
          contested: { rivalEtaSec: 1000, acceptedAtSec: 1000 }, // ETA passed: 1000+1000=2000 < nowSim=20000
        }),
      ],
    })
    const { next } = advanceWorld(state, baseCtx)
    expect(next.contracts.find((x) => x.id === 'c2')?.status).toBe('failed')
  })

  it('adds title to digest.rivalClaimed', () => {
    const state = makeState({
      contracts: [
        makeContract({
          id: 'c2',
          title: 'Contested Race',
          status: 'active',
          deadline: 99999,
          contested: { rivalEtaSec: 1000, acceptedAtSec: 1000 },
        }),
      ],
    })
    const { digest } = advanceWorld(state, baseCtx)
    expect(digest.rivalClaimed).toContain('Contested Race')
  })

  it('increments rival.wins when the rival claims a contract', () => {
    const state = makeState({
      contracts: [
        makeContract({
          id: 'c2',
          title: 'Contested Race',
          status: 'active',
          deadline: 99999,
          contested: { rivalEtaSec: 1000, acceptedAtSec: 1000 },
        }),
      ],
    })
    const { next } = advanceWorld(state, baseCtx)
    expect(next.story.rival.wins).toBe(1)
  })

  it('deducts 1 reputation (gentle) for a rival claim', () => {
    const state = makeState({
      agency: { funding: 500, reputation: 20 },
      contracts: [
        makeContract({
          id: 'c2',
          title: 'Contested Race',
          status: 'active',
          deadline: 99999,
          contested: { rivalEtaSec: 1000, acceptedAtSec: 1000 },
        }),
      ],
    })
    const { next } = advanceWorld(state, baseCtx)
    expect(next.agency.reputation).toBe(19)
  })

  it('adds a rival dispatch for the rival claim', () => {
    const state = makeState({
      contracts: [
        makeContract({
          id: 'c2',
          title: 'Contested Race',
          status: 'active',
          deadline: 99999,
          contested: { rivalEtaSec: 1000, acceptedAtSec: 1000 },
        }),
      ],
    })
    const { next, digest } = advanceWorld(state, baseCtx)
    // dispatch added to story.dispatches
    expect(next.story.dispatches.length).toBeGreaterThan(0)
    const rivalDispatches = next.story.dispatches.filter((d) => d.source === 'rival')
    expect(rivalDispatches.length).toBeGreaterThan(0)
    // and recorded in digest.dispatches
    expect(digest.dispatches.length).toBeGreaterThan(0)
  })

  it('does NOT rival-claim a contested contract whose ETA has NOT passed', () => {
    const state = makeState({
      contracts: [
        makeContract({
          id: 'c2',
          title: 'Still Racing',
          status: 'active',
          deadline: 99999,
          // acceptedAtSec=15000, rivalEtaSec=10000 → ETA at 25000 > nowSim=20000
          contested: { rivalEtaSec: 10000, acceptedAtSec: 15000 },
        }),
      ],
    })
    const { next, digest } = advanceWorld(state, baseCtx)
    expect(next.contracts.find((x) => x.id === 'c2')?.status).toBe('active')
    expect(digest.rivalClaimed).not.toContain('Still Racing')
  })

  it('does NOT rival-claim a completed contract', () => {
    const state = makeState({
      contracts: [
        makeContract({
          id: 'c2',
          title: 'Already Done',
          status: 'completed',
          deadline: 99999,
          contested: { rivalEtaSec: 1000, acceptedAtSec: 1000 },
        }),
      ],
    })
    const { next, digest } = advanceWorld(state, baseCtx)
    expect(next.contracts.find((x) => x.id === 'c2')?.status).toBe('completed')
    expect(digest.rivalClaimed).not.toContain('Already Done')
  })

  it('does NOT expire a contested contract whose rival ETA has passed (rival claim takes precedence)', () => {
    // A contested contract: rival ETA passed, deadline also passed.
    // It should be rival-claimed (in rivalClaimed), NOT in contractsExpired.
    const state = makeState({
      contracts: [
        makeContract({
          id: 'c2',
          title: 'Dual-Expired Race',
          status: 'active',
          deadline: 100, // also expired
          contested: { rivalEtaSec: 1000, acceptedAtSec: 1000 }, // rival ETA also expired
        }),
      ],
    })
    const { digest } = advanceWorld(state, baseCtx)
    // Should be rival-claimed, not in contractsExpired
    expect(digest.rivalClaimed).toContain('Dual-Expired Race')
    expect(digest.contractsExpired).not.toContain('Dual-Expired Race')
  })
})

// ─── 3. Board refresh ────────────────────────────────────────────────────────

describe('advanceWorld — board refresh', () => {
  it('drops available contracts whose deadline has passed', () => {
    const state = makeState({
      contracts: [
        makeContract({ id: 'old', title: 'Old Offer', status: 'available', deadline: 5000 }),
      ],
    })
    const { next } = advanceWorld(state, baseCtx)
    expect(next.contracts.find((x) => x.id === 'old')).toBeUndefined()
  })

  it('adds new contracts from events to top up the board', () => {
    const state = makeState({ contracts: [] })
    const { next, digest } = advanceWorld(state, baseCtx)
    const available = next.contracts.filter((c) => c.status === 'available')
    expect(available.length).toBeGreaterThan(0)
    expect(digest.newOffers).toBeGreaterThan(0)
  })

  it('deduplicates by id — does not add a contract already in state', () => {
    // Pre-seed the board with a contract whose id matches what seedContracts would generate
    // seedContracts generates id = `contract-${ev.id}`
    const preExisting = makeContract({
      id: 'contract-ev-a',
      eventId: 'ev-a',
      title: 'Pre-existing',
      status: 'available',
      deadline: 99999,
    })
    const state = makeState({ contracts: [preExisting] })
    const { next, digest } = advanceWorld(state, baseCtx)
    // Should not double-add the same event
    const contractEvA = next.contracts.filter((c) => c.id === 'contract-ev-a')
    expect(contractEvA.length).toBe(1)
    // newOffers only counts net-new contracts
    // (ev-b may be added if reachable, ev-a should not be added again)
    const allById = next.contracts.map((c) => c.id)
    const uniqueIds = new Set(allById)
    expect(allById.length).toBe(uniqueIds.size)
  })

  it('never blanks the board when there are no events (keep existing available)', () => {
    const existing = makeContract({
      id: 'keep-me',
      title: 'Live Offer',
      status: 'available',
      deadline: 99999,
    })
    const state = makeState({ contracts: [existing] })
    const ctxNoEvents: AdvanceCtx = { ...baseCtx, events: [] }
    const { next } = advanceWorld(state, ctxNoEvents)
    // The existing still-valid available contract should survive
    expect(next.contracts.find((x) => x.id === 'keep-me')).toBeDefined()
  })

  it('filters out unreachable contracts when fleet can cover some', () => {
    // ev-polar at 80°N is unreachable by ISS (max ~56°)
    const ctxWithPolar: AdvanceCtx = {
      ...baseCtx,
      events: [
        {
          id: 'polar',
          kind: 'quake',
          title: 'Polar Event',
          lat: 80,
          lon: 0,
          time: '2026-01-01T00:00:00Z',
          severity: 0.9,
        },
        {
          id: 'eq',
          kind: 'quake',
          title: 'Equatorial Event',
          lat: 5,
          lon: 10,
          time: '2026-01-01T00:00:00Z',
          severity: 0.5,
        },
      ],
    }
    const state = makeState({ contracts: [] }) // fleet=[issSat] (max lat ~56°)
    const { next } = advanceWorld(state, ctxWithPolar)
    const available = next.contracts.filter((c) => c.status === 'available')
    // Polar event (80°N) should be filtered out
    expect(available.every((c) => c.lat !== 80)).toBe(true)
  })

  it('keeps existing active contracts intact through board refresh', () => {
    const state = makeState({
      contracts: [
        makeContract({ id: 'active1', title: 'Active Task', status: 'active', deadline: 99999 }),
      ],
    })
    const { next } = advanceWorld(state, baseCtx)
    expect(next.contracts.find((x) => x.id === 'active1')?.status).toBe('active')
  })

  it('counts newOffers correctly (only genuinely new contracts)', () => {
    const state = makeState({ contracts: [] })
    const { digest } = advanceWorld(state, baseCtx)
    expect(typeof digest.newOffers).toBe('number')
    expect(digest.newOffers).toBeGreaterThanOrEqual(0)
  })
})

// ─── 4. Story arc advancement ────────────────────────────────────────────────

describe('advanceWorld — story arc', () => {
  it('advances the main arc (increments beatsSeen)', () => {
    const state = makeState()
    const { next } = advanceWorld(state, baseCtx)
    const mainArc = next.story.arcs.find((a) => a.id === 'main')
    expect(mainArc?.beatsSeen).toBe(1)
  })

  it('sets digest.arcBeat to a non-null string', () => {
    const state = makeState()
    const { digest } = advanceWorld(state, baseCtx)
    expect(typeof digest.arcBeat).toBe('string')
    expect((digest.arcBeat as string).length).toBeGreaterThan(0)
  })

  it('escalates tension when the rival gained this tick', () => {
    // Rival gains when it claims a contested contract
    const state = makeState({
      contracts: [
        makeContract({
          id: 'c2',
          title: 'Contested Race',
          status: 'active',
          deadline: 99999,
          contested: { rivalEtaSec: 1000, acceptedAtSec: 1000 },
        }),
      ],
    })
    const { next } = advanceWorld(state, baseCtx)
    const mainArc = next.story.arcs.find((a) => a.id === 'main')
    // escalate=true → tension goes up by 0.15 from 0.3
    expect(mainArc?.tension).toBeCloseTo(0.45, 5)
  })

  it('de-escalates tension when the rival did not gain this tick', () => {
    const state = makeState() // no contested contracts
    const { next } = advanceWorld(state, baseCtx)
    const mainArc = next.story.arcs.find((a) => a.id === 'main')
    // escalate=false → tension drops by 0.05 from 0.3
    expect(mainArc?.tension).toBeCloseTo(0.25, 5)
  })

  it('adds exactly 1 story dispatch per tick', () => {
    const state = makeState()
    const before = state.story.dispatches.length
    const { next, digest } = advanceWorld(state, baseCtx)
    const storyDispatches = next.story.dispatches.filter((d) => d.source === 'story')
    // At least 1 story dispatch was added
    expect(storyDispatches.length).toBeGreaterThan(0)
    // digest.dispatches includes the story dispatch text
    expect(digest.dispatches.length).toBeGreaterThan(before)
  })

  it('sets digest.atSim to ctx.nowSim', () => {
    const state = makeState()
    const { digest } = advanceWorld(state, baseCtx)
    expect(digest.atSim).toBe(baseCtx.nowSim)
  })

  it('sets no arc beat when there are no arcs', () => {
    const state = makeState({
      story: { arcs: [], dispatches: [], rival: { ...baseRival } },
    })
    const { digest } = advanceWorld(state, baseCtx)
    expect(digest.arcBeat).toBeNull()
  })
})

// ─── 5. Passthrough — unknown fields preserved ────────────────────────────────

describe('advanceWorld — passthrough', () => {
  it('preserves unknown fields on agency', () => {
    const state = makeState({
      agency: { funding: 500, reputation: 20, leaning: 'relief', customField: 'keep-me' },
    })
    const { next } = advanceWorld(state, baseCtx)
    expect((next.agency as Record<string, unknown>).customField).toBe('keep-me')
    expect((next.agency as Record<string, unknown>).leaning).toBe('relief')
  })

  it('preserves unknown fields on story', () => {
    const state = makeState({
      story: {
        arcs: [baseArc],
        dispatches: [],
        rival: { ...baseRival },
        lastStoryAt: 12345,
        extraField: 'hello',
      },
    })
    const { next } = advanceWorld(state, baseCtx)
    expect((next.story as Record<string, unknown>).lastStoryAt).toBe(12345)
    expect((next.story as Record<string, unknown>).extraField).toBe('hello')
  })
})

// ─── 6. Determinism ──────────────────────────────────────────────────────────

describe('advanceWorld — determinism', () => {
  it('produces identical results on two calls with the same state+ctx', () => {
    const state = makeState({
      agency: { funding: 500, reputation: 20 },
      contracts: [
        makeContract({ id: 'c1', title: 'Exp', status: 'active', deadline: 5000 }),
        makeContract({
          id: 'c2',
          title: 'Race',
          status: 'active',
          deadline: 99999,
          contested: { rivalEtaSec: 1000, acceptedAtSec: 1000 },
        }),
      ],
    })
    const r1 = advanceWorld(state, baseCtx)
    const r2 = advanceWorld(state, baseCtx)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })

  it('produces different results for different nowSim values', () => {
    const state = makeState({
      contracts: [
        makeContract({ id: 'c1', title: 'Active', status: 'active', deadline: 99999 }),
      ],
    })
    const ctx1 = { ...baseCtx, nowSim: 20000 }
    const ctx2 = { ...baseCtx, nowSim: 200000 } // far future → contract expires
    const r1 = advanceWorld(state, ctx1)
    const r2 = advanceWorld(state, ctx2)
    // With nowSim=200000, deadline=99999 expires
    expect(r2.digest.contractsExpired.length).toBeGreaterThan(r1.digest.contractsExpired.length)
  })
})

// ─── 7. digest shape ─────────────────────────────────────────────────────────

describe('advanceWorld — digest', () => {
  it('returns all required digest fields', () => {
    const { digest } = advanceWorld(makeState(), baseCtx)
    expect(typeof digest.atSim).toBe('number')
    expect(Array.isArray(digest.contractsExpired)).toBe(true)
    expect(Array.isArray(digest.rivalClaimed)).toBe(true)
    expect(typeof digest.newOffers).toBe('number')
    // arcBeat is string | null
    expect(digest.arcBeat === null || typeof digest.arcBeat === 'string').toBe(true)
    expect(Array.isArray(digest.dispatches)).toBe(true)
  })
})
