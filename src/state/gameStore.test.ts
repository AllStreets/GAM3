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
