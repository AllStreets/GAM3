import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore, burnCost, previewElements } from './gameStore'
import { apoapsis } from '@/lib/orbits'
import { seedCapability } from '@/lib/satelliteMeta'
import { saveJSON } from '@/lib/persist'
import { useStoryStore } from './storyStore'

beforeEach(() => {
  useGameStore.getState().resetForTest()
})

describe('gameStore', () => {
  it('seeds five satellites with full fuel', () => {
    const sats = useGameStore.getState().satellites
    expect(sats).toHaveLength(5)
    expect(sats[0].name).toBe('HYPERION-1')
    expect(sats[0].fuel).toBe(sats[0].fuelCapacity)
  })

  it('burnCost is the vector magnitude in m/s', () => {
    expect(burnCost({ prograde: 3, normal: 4, radial: 0 })).toBeCloseTo(5, 9)
  })

  it('previewElements raises apoapsis for a prograde plan', () => {
    const sat = useGameStore.getState().satellites[0]
    const el2 = previewElements(sat, { prograde: 40, normal: 0, radial: 0 }, 1000)
    expect(apoapsis(el2)).toBeGreaterThan(apoapsis(sat.elements))
  })

  it('executeBurn applies elements, deducts fuel, clears the plan', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 30 })
    const before = useGameStore.getState().satellites[0]
    const ok = useGameStore.getState().executeBurn(500)
    const after = useGameStore.getState().satellites[0]
    expect(ok).toBe(true)
    expect(after.fuel).toBeCloseTo(before.fuel - 30, 6)
    expect(after.elements.a).toBeGreaterThan(before.elements.a)
    expect(useGameStore.getState().burnPlan).toEqual({ prograde: 0, normal: 0, radial: 0 })
  })

  it('executeBurn refuses when fuel is insufficient', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 100000 })
    const before = useGameStore.getState().satellites[0]
    expect(useGameStore.getState().executeBurn(500)).toBe(false)
    const after = useGameStore.getState().satellites[0]
    expect(after.fuel).toBe(before.fuel)
    expect(after.elements).toEqual(before.elements)
  })

  it('executeBurn with no selection is a no-op returning false', () => {
    expect(useGameStore.getState().executeBurn(0)).toBe(false)
  })
})

import { burnDuration, fuelCostWithQuality } from './gameStore'

describe('burn math', () => {
  it('burnDuration clamps to [2, 8] wall seconds', () => {
    expect(burnDuration(10)).toBe(2)
    expect(burnDuration(80)).toBeCloseTo(4, 9)
    expect(burnDuration(400)).toBe(8)
  })
  it('fuelCostWithQuality: perfect burn costs the plan, sloppy burn overspends 25%', () => {
    expect(fuelCostWithQuality(100, 1)).toBeCloseTo(100, 9)
    expect(fuelCostWithQuality(100, 0)).toBeCloseTo(125, 9)
    expect(fuelCostWithQuality(100, 0.6)).toBeCloseTo(110, 9)
  })
})

describe('burn session', () => {
  it('beginBurn snapshots a session without touching fuel or elements', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 40 })
    expect(useGameStore.getState().beginBurn()).toBe(true)
    const s = useGameStore.getState()
    expect(s.burnSession).toMatchObject({ satId: s.satellites[0].id, cost: 40 })
    expect(s.burnSession!.duration).toBeCloseTo(2, 9)
    expect(s.satellites[0].fuel).toBe(s.satellites[0].fuelCapacity)
  })

  it('beginBurn refuses when worst-case cost exceeds fuel', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 1500 }) // 1500 * 1.25 = 1875 > 1800
    expect(useGameStore.getState().beginBurn()).toBe(false)
    expect(useGameStore.getState().burnSession).toBeNull()
  })

  it('completeBurn applies elements, deducts quality-scaled fuel, clears session and plan', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 40 })
    useGameStore.getState().beginBurn()
    const before = useGameStore.getState().satellites[0]
    expect(useGameStore.getState().completeBurn(500, 0.5)).toBe(true)
    const after = useGameStore.getState().satellites[0]
    expect(after.elements.a).toBeGreaterThan(before.elements.a)
    expect(after.fuel).toBeCloseTo(before.fuel - 40 * 1.125, 6)
    expect(useGameStore.getState().burnSession).toBeNull()
    expect(useGameStore.getState().burnPlan).toEqual({ prograde: 0, normal: 0, radial: 0 })
  })

  it('abortBurn clears the session but keeps plan and fuel', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 40 })
    useGameStore.getState().beginBurn()
    useGameStore.getState().abortBurn()
    const s = useGameStore.getState()
    expect(s.burnSession).toBeNull()
    expect(s.burnPlan.prograde).toBe(40)
    expect(s.satellites[0].fuel).toBe(s.satellites[0].fuelCapacity)
  })

  it('completeBurn with no session is a no-op returning false', () => {
    expect(useGameStore.getState().completeBurn(0, 1)).toBe(false)
  })

  it('beginBurn refuses while a session is active', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 40 })
    expect(useGameStore.getState().beginBurn()).toBe(true)
    expect(useGameStore.getState().beginBurn()).toBe(false)
  })

  it('completeBurn sets lastManeuver with a valid grade (free-flight, no active contract)', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 40 })
    useGameStore.getState().beginBurn()
    expect(useGameStore.getState().completeBurn(500, 1)).toBe(true)
    const lm = useGameStore.getState().lastManeuver
    expect(lm).not.toBeNull()
    expect(['S', 'A', 'B', 'C']).toContain(lm!.grade)
    expect(lm!.efficiency).toBeGreaterThan(0)
    expect(lm!.efficiency).toBeLessThanOrEqual(1)
    // No active contract → closestKm=0 → precision=1 → graded on efficiency (perfect burn → S)
    expect(lm!.precision).toBeCloseTo(1)
    expect(lm!.grade).toBe('S')
  })

  it('resetForTest clears lastManeuver and lastTrickShot', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 40 })
    useGameStore.getState().beginBurn()
    useGameStore.getState().completeBurn(500, 1)
    useGameStore.getState().resetForTest()
    expect(useGameStore.getState().lastManeuver).toBeNull()
    expect(useGameStore.getState().lastTrickShot).toBeNull()
  })
})

import { useAgencyStore } from './agencyStore'
import { SATELLITE_PRICE } from '@/lib/economy'

describe('fleet economy', () => {
  beforeEach(() => {
    useGameStore.getState().resetForTest()
    useAgencyStore.getState().resetForTest()
  })

  it('seed fleet has the larger tanks', () => {
    const [a, b] = useGameStore.getState().satellites
    expect(a.fuelCapacity).toBe(1800)
    expect(b.fuelCapacity).toBe(1500)
  })

  it('refuelSatellite refills to capacity and charges funding', () => {
    const g = useGameStore.getState()
    const id = g.satellites[0].id
    // drain via a burn
    g.select(id); g.setBurnPlan({ prograde: 100 }); useGameStore.getState().executeBurn(0)
    const before = useAgencyStore.getState().funding
    expect(useGameStore.getState().refuelSatellite(id)).toBe(true)
    expect(useGameStore.getState().satellites[0].fuel).toBe(1800)
    expect(useAgencyStore.getState().funding).toBeLessThan(before)
  })

  it('refuel fails with insufficient funding', () => {
    const g = useGameStore.getState()
    const id = g.satellites[0].id
    g.select(id); g.setBurnPlan({ prograde: 100 }); useGameStore.getState().executeBurn(0)
    useAgencyStore.setState({ funding: 0 })
    expect(useGameStore.getState().refuelSatellite(id)).toBe(false)
  })

  it('buySatellite appends a bird and charges the price', () => {
    useAgencyStore.setState({ funding: SATELLITE_PRICE + 10 })
    const n = useGameStore.getState().satellites.length
    expect(useGameStore.getState().buySatellite()).toBe(true)
    expect(useGameStore.getState().satellites.length).toBe(n + 1)
    expect(useAgencyStore.getState().funding).toBe(10)
  })

  it('buySatellite refuses when broke', () => {
    useAgencyStore.setState({ funding: 0 })
    expect(useGameStore.getState().buySatellite()).toBe(false)
  })

  it('refuelSatellite (no arg) does a partial refuel buying only what is affordable', () => {
    const g = useGameStore.getState()
    const id = g.satellites[0].id
    // drain 300 m/s via burn
    g.select(id); g.setBurnPlan({ prograde: 300 }); useGameStore.getState().executeBurn(0)
    const before = useGameStore.getState().satellites[0]
    // Give just enough funds to buy 100 m/s at 0.6 §/m/s → cost=60
    useAgencyStore.setState({ funding: 60 })
    expect(useGameStore.getState().refuelSatellite(id)).toBe(true)
    const after = useGameStore.getState().satellites[0]
    // floor(60 / 0.6) = 100 Δv added
    expect(after.fuel).toBe(before.fuel + 100)
    expect(useAgencyStore.getState().funding).toBe(0)
  })

  it('refuelSatellite with explicit dv arg buys only that amount', () => {
    const g = useGameStore.getState()
    const id = g.satellites[0].id
    // drain 500 m/s
    g.select(id); g.setBurnPlan({ prograde: 500 }); useGameStore.getState().executeBurn(0)
    const before = useGameStore.getState().satellites[0]
    useAgencyStore.setState({ funding: 1000 })
    expect(useGameStore.getState().refuelSatellite(id, 200)).toBe(true)
    const after = useGameStore.getState().satellites[0]
    expect(after.fuel).toBe(before.fuel + 200)
    // cost = ceil(200 * 0.6) = 120
    expect(useAgencyStore.getState().funding).toBe(880)
  })

  it('refuelSatellite caps explicit dv at the missing amount (no overfill)', () => {
    const g = useGameStore.getState()
    const id = g.satellites[0].id
    // drain 100 m/s (leaves 1700/1800)
    g.select(id); g.setBurnPlan({ prograde: 100 }); useGameStore.getState().executeBurn(0)
    useAgencyStore.setState({ funding: 9999 })
    expect(useGameStore.getState().refuelSatellite(id, 9999)).toBe(true)
    expect(useGameStore.getState().satellites[0].fuel).toBe(1800) // capped at fuelCapacity
  })
})

describe('emergency conjunctions', () => {
  beforeEach(() => {
    useGameStore.getState().resetForTest()
  })

  it('maybeSpawnConjunction sets emergency when conditions are met', () => {
    const g = useGameStore.getState()
    // now=5000, lastConjunctionAt=0, minGapSec=3600 met, roll=0.05 < 0.08 → spawn
    g.maybeSpawnConjunction(5000, 0.05)
    expect(useGameStore.getState().emergency).not.toBeNull()
    expect(useGameStore.getState().lastConjunctionAt).toBe(5000)
  })

  it('maybeSpawnConjunction does not spawn when gap is not met', () => {
    const g = useGameStore.getState()
    g.maybeSpawnConjunction(100, 0.05) // gap too small (only 100 since lastConjunctionAt=0, minGapSec=3600)
    expect(useGameStore.getState().emergency).toBeNull()
  })

  it('maybeSpawnConjunction does not spawn when roll >= 0.08', () => {
    const g = useGameStore.getState()
    g.maybeSpawnConjunction(5000, 0.20) // gap met, but roll too high
    expect(useGameStore.getState().emergency).toBeNull()
  })

  it('resolveEmergencyByBurn clears emergency when dvSpent >= requiredDv', () => {
    const g = useGameStore.getState()
    g.maybeSpawnConjunction(5000, 0.05)
    const { emergency } = useGameStore.getState()
    expect(emergency).not.toBeNull()
    g.resolveEmergencyByBurn(emergency!.satId, emergency!.requiredDv)
    expect(useGameStore.getState().emergency).toBeNull()
  })

  it('resolveEmergencyByBurn does NOT clear emergency when dvSpent < requiredDv', () => {
    const g = useGameStore.getState()
    g.maybeSpawnConjunction(5000, 0.05)
    const { emergency } = useGameStore.getState()
    g.resolveEmergencyByBurn(emergency!.satId, emergency!.requiredDv - 1)
    expect(useGameStore.getState().emergency).not.toBeNull()
  })

  it('tickEmergency loses the satellite after deadline passes', () => {
    const g = useGameStore.getState()
    const satCount = useGameStore.getState().satellites.length
    g.maybeSpawnConjunction(5000, 0.05)
    const { emergency } = useGameStore.getState()
    // Tick past the deadline
    g.tickEmergency(emergency!.deadline + 1)
    const after = useGameStore.getState()
    expect(after.emergency).toBeNull()
    expect(after.satellites.length).toBeLessThan(satCount)
    expect(after.lastLoss).not.toBeNull()
    expect(after.lastLoss!.name).toBeTruthy()
  })

  it('losing the last satellite grants a provisional replacement (length >= 1)', () => {
    const g = useGameStore.getState()
    // Remove all but one satellite first
    const { satellites } = useGameStore.getState()
    // Force the state to have only 1 satellite
    useGameStore.setState({ satellites: [satellites[0]] })
    // Spawn conjunction on the only satellite
    g.maybeSpawnConjunction(5000, 0.05)
    const { emergency } = useGameStore.getState()
    expect(emergency).not.toBeNull()
    // Tick past deadline — should lose the sat but grant a replacement
    g.tickEmergency(emergency!.deadline + 1)
    const after = useGameStore.getState()
    expect(after.satellites.length).toBeGreaterThanOrEqual(1)
    expect(after.lastLoss).not.toBeNull()
  })

  it('payEvasion deducts fuel from the satellite and clears emergency', () => {
    const g = useGameStore.getState()
    g.maybeSpawnConjunction(5000, 0.05)
    const { emergency } = useGameStore.getState()
    const sat = useGameStore.getState().satellites.find((s) => s.id === emergency!.satId)!
    const fuelBefore = sat.fuel
    const ok = g.payEvasion()
    expect(ok).toBe(true)
    expect(useGameStore.getState().emergency).toBeNull()
    const satAfter = useGameStore.getState().satellites.find((s) => s.id === sat.id)!
    expect(satAfter.fuel).toBe(fuelBefore - emergency!.requiredDv)
  })

  it('payEvasion returns false when satellite has insufficient fuel', () => {
    const g = useGameStore.getState()
    g.maybeSpawnConjunction(5000, 0.05)
    const { emergency } = useGameStore.getState()
    // Set fuel to zero
    useGameStore.setState({
      satellites: useGameStore.getState().satellites.map((s) =>
        s.id === emergency!.satId ? { ...s, fuel: 0 } : s,
      ),
    })
    const ok = g.payEvasion()
    expect(ok).toBe(false)
    expect(useGameStore.getState().emergency).not.toBeNull()
  })

  it('clearLoss sets lastLoss to null', () => {
    useGameStore.setState({ lastLoss: { name: 'HYPERION-TEST' } })
    useGameStore.getState().clearLoss()
    expect(useGameStore.getState().lastLoss).toBeNull()
  })

  it('resetForTest clears emergency, lastConjunctionAt, and lastLoss', () => {
    useGameStore.setState({ emergency: null, lastConjunctionAt: 999, lastLoss: { name: 'X' } })
    useGameStore.getState().resetForTest()
    const s = useGameStore.getState()
    expect(s.emergency).toBeNull()
    expect(s.lastConjunctionAt).toBe(0)
    expect(s.lastLoss).toBeNull()
  })
})

describe('satellite capabilities and service records', () => {
  beforeEach(() => {
    useGameStore.getState().resetForTest()
  })

  it('seeded fleet has 5 capabilities matching seedCapability(index)', () => {
    const sats = useGameStore.getState().satellites
    expect(sats).toHaveLength(5)
    sats.forEach((sat, i) => {
      expect(sat.capability).toBe(seedCapability(i))
    })
  })

  it('recordContractPass increments contractsCompleted and prepends note capped at 6', () => {
    const satId = useGameStore.getState().satellites[0].id
    useGameStore.getState().recordContractPass(satId, 'First pass · SD 1')
    useGameStore.getState().recordContractPass(satId, 'Second pass · SD 2')
    const sat = useGameStore.getState().satellites[0]
    expect(sat.record.contractsCompleted).toBe(2)
    expect(sat.record.notablePasses[0]).toBe('Second pass · SD 2')
    expect(sat.record.notablePasses[1]).toBe('First pass · SD 1')
    // Fill to 7 entries, cap should remain 6
    for (let i = 3; i <= 7; i++) {
      useGameStore.getState().recordContractPass(satId, `Pass ${i} · SD ${i}`)
    }
    expect(useGameStore.getState().satellites[0].record.notablePasses).toHaveLength(6)
  })

  it('hydrate backfills a legacy satellite object lacking capability/record', () => {
    // Manually save a legacy fleet without capability/record
    const legacyFleet = {
      satellites: [
        { id: 'hyp-1', name: 'HYPERION-1', elements: { a: 1.065, e: 0.0012, i: 0.9, raan: 0.8, argp: 0.3, m0: 0, epoch: 0 }, fuel: 1800, fuelCapacity: 1800 },
        { id: 'hyp-2', name: 'HYPERION-2', elements: { a: 1.12, e: 0.002, i: 1.7, raan: 2.4, argp: 1.1, m0: 2.0, epoch: 0 }, fuel: 1500, fuelCapacity: 1500 },
      ],
    }
    saveJSON('hyperion-fleet-v1', legacyFleet)
    useGameStore.getState().hydrate()
    const sats = useGameStore.getState().satellites
    expect(sats[0].capability).toBe(seedCapability(0))
    expect(sats[0].record).toMatchObject({ contractsCompleted: 0, notablePasses: [], commissionedAt: 0 })
    expect(sats[1].capability).toBe(seedCapability(1))
    expect(sats[1].record).toMatchObject({ contractsCompleted: 0, notablePasses: [], commissionedAt: 0 })
  })
})

// ─── emergencyRefit ───────────────────────────────────────────────────────────

describe('gameStore.emergencyRefit', () => {
  beforeEach(() => {
    useGameStore.getState().resetForTest()
    useAgencyStore.getState().resetForTest()
    useStoryStore.getState().resetForTest()
  })

  it('returns false when no refit token is available', () => {
    const sat = useGameStore.getState().satellites[0]
    // Drain some fuel so it's not full
    useGameStore.setState({
      satellites: useGameStore.getState().satellites.map((s) =>
        s.id === sat.id ? { ...s, fuel: 500 } : s,
      ),
    })
    // No tokens available (default 0)
    expect(useGameStore.getState().emergencyRefit(sat.id)).toBe(false)
    // Fuel should be unchanged
    expect(useGameStore.getState().satellites[0].fuel).toBe(500)
  })

  it('returns false when the satellite is already at full fuel', () => {
    // Earn a refit token
    for (let i = 0; i < 5; i++) useAgencyStore.getState().recordCompletionMilestone()
    const sat = useGameStore.getState().satellites[0]
    // Satellite is at full fuel by default
    expect(sat.fuel).toBe(sat.fuelCapacity)
    expect(useGameStore.getState().emergencyRefit(sat.id)).toBe(false)
    // Token should NOT have been spent
    expect(useAgencyStore.getState().milestones.refitTokens).toBe(1)
  })

  it('fully refuels a drained satellite for free and consumes 1 token', () => {
    // Earn a refit token
    for (let i = 0; i < 5; i++) useAgencyStore.getState().recordCompletionMilestone()
    expect(useAgencyStore.getState().milestones.refitTokens).toBe(1)

    // Drain the first satellite
    const sat = useGameStore.getState().satellites[0]
    useGameStore.setState({
      satellites: useGameStore.getState().satellites.map((s) =>
        s.id === sat.id ? { ...s, fuel: 100 } : s,
      ),
    })

    const fundingBefore = useAgencyStore.getState().funding
    const ok = useGameStore.getState().emergencyRefit(sat.id)
    expect(ok).toBe(true)

    // Satellite is fully refuelled
    const satAfter = useGameStore.getState().satellites.find((s) => s.id === sat.id)!
    expect(satAfter.fuel).toBe(satAfter.fuelCapacity)

    // Token was consumed
    expect(useAgencyStore.getState().milestones.refitTokens).toBe(0)

    // No funding was spent
    expect(useAgencyStore.getState().funding).toBe(fundingBefore)
  })

  it('emits a story dispatch mentioning the satellite name', () => {
    // Earn a token and drain the satellite
    for (let i = 0; i < 5; i++) useAgencyStore.getState().recordCompletionMilestone()
    const sat = useGameStore.getState().satellites[0]
    useGameStore.setState({
      satellites: useGameStore.getState().satellites.map((s) =>
        s.id === sat.id ? { ...s, fuel: 100 } : s,
      ),
    })
    useGameStore.getState().emergencyRefit(sat.id)
    const dispatches = useStoryStore.getState().dispatches
    expect(dispatches.length).toBeGreaterThan(0)
    expect(dispatches[0].text).toMatch(/emergency refit/i)
    expect(dispatches[0].text).toContain(sat.name)
  })
})

// ─── buySatelliteAimed ───────────────────────────────────────────────────────

import { isTargetReachable } from '@/lib/reachability'

describe('gameStore.buySatelliteAimed', () => {
  beforeEach(() => {
    useGameStore.getState().resetForTest()
    useAgencyStore.getState().resetForTest()
  })

  it('with no target behaves like buySatellite (auto mode)', () => {
    useAgencyStore.setState({ funding: SATELLITE_PRICE + 100 })
    const n = useGameStore.getState().satellites.length
    expect(useGameStore.getState().buySatelliteAimed()).toBe(true)
    expect(useGameStore.getState().satellites.length).toBe(n + 1)
    expect(useAgencyStore.getState().funding).toBe(100)
  })

  it('returns false when insufficient funding', () => {
    useAgencyStore.setState({ funding: 0 })
    const n = useGameStore.getState().satellites.length
    expect(useGameStore.getState().buySatelliteAimed({ lat: 35, lon: 139 })).toBe(false)
    expect(useGameStore.getState().satellites.length).toBe(n)
  })

  it('aimed at a mid-latitude target yields a satellite whose orbit covers that latitude', () => {
    useAgencyStore.setState({ funding: SATELLITE_PRICE + 100 })
    const target = { lat: 35, lon: 139 }
    const ok = useGameStore.getState().buySatelliteAimed(target)
    expect(ok).toBe(true)
    const sats = useGameStore.getState().satellites
    const newSat = sats[sats.length - 1]
    expect(isTargetReachable(newSat.elements, target.lat)).toBe(true)
  })

  it('aimed at a polar target (80°N) yields a satellite that covers 80°N', () => {
    useAgencyStore.setState({ funding: SATELLITE_PRICE + 100 })
    const target = { lat: 80, lon: 20 }
    const ok = useGameStore.getState().buySatelliteAimed(target)
    expect(ok).toBe(true)
    const sats = useGameStore.getState().satellites
    const newSat = sats[sats.length - 1]
    expect(isTargetReachable(newSat.elements, 80)).toBe(true)
  })

  it('aimed at a southern hemisphere target (-45°S) yields coverage', () => {
    useAgencyStore.setState({ funding: SATELLITE_PRICE + 100 })
    const target = { lat: -45, lon: 170 }
    const ok = useGameStore.getState().buySatelliteAimed(target)
    expect(ok).toBe(true)
    const sats = useGameStore.getState().satellites
    const newSat = sats[sats.length - 1]
    expect(isTargetReachable(newSat.elements, -45)).toBe(true)
  })

  it('deducts SATELLITE_PRICE from agency funding', () => {
    useAgencyStore.setState({ funding: SATELLITE_PRICE + 50 })
    useGameStore.getState().buySatelliteAimed({ lat: 35, lon: 139 })
    expect(useAgencyStore.getState().funding).toBe(50)
  })

  it('buySatellite (original) still works unchanged after adding buySatelliteAimed', () => {
    useAgencyStore.setState({ funding: SATELLITE_PRICE + 10 })
    const n = useGameStore.getState().satellites.length
    expect(useGameStore.getState().buySatellite()).toBe(true)
    expect(useGameStore.getState().satellites.length).toBe(n + 1)
    expect(useAgencyStore.getState().funding).toBe(10)
  })
})
