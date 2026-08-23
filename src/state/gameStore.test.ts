import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore, burnCost, previewElements } from './gameStore'
import { apoapsis } from '@/lib/orbits'

beforeEach(() => {
  useGameStore.getState().resetForTest()
})

describe('gameStore', () => {
  it('seeds two satellites with full fuel', () => {
    const sats = useGameStore.getState().satellites
    expect(sats).toHaveLength(2)
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
    st.setBurnPlan({ prograde: 400 }) // 400 * 1.25 = 500 > 450
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
})
