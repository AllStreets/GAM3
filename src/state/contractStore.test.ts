import { describe, it, expect, beforeEach } from 'vitest'
import { useContractStore, type Contract } from './contractStore'
import { useAgencyStore } from './agencyStore'
import { useGameStore } from './gameStore'
import { subPoint } from '@/lib/intercept'
import { matchBonusFunding } from '@/lib/contractMeta'
import { saveJSON } from '@/lib/persist'

// Use a far-future deadline (sim-seconds) so tests do not inadvertently hit the
// stale-contract expiry guard. Individual tests that want to test expiry pass
// their own deadline override.
const FAR_FUTURE = 999_999_999
const mk = (over: Partial<Contract> = {}): Contract => ({
  id: 'c1', eventId: 'e1', title: 'Test', kind: 'quake', lat: 0, lon: 0,
  deadline: FAR_FUTURE, reward: { funding: 200, reputation: 10 }, status: 'available',
  archetype: 'relief', preferredCapability: 'imaging',
  ...over,
})

beforeEach(() => {
  useContractStore.getState().resetForTest()
  useAgencyStore.getState().resetForTest()
  useGameStore.getState().resetForTest()
})

describe('contractStore', () => {
  it('setAvailable adds new contracts without clobbering existing status', () => {
    useContractStore.getState().setAvailable([mk()])
    useContractStore.getState().accept('c1')
    useContractStore.getState().setAvailable([mk(), mk({ id: 'c2' })])
    const cs = useContractStore.getState().contracts
    expect(cs.find((c) => c.id === 'c1')!.status).toBe('active') // not reset to available
    expect(cs.find((c) => c.id === 'c2')!.status).toBe('available')
  })

  it('accept respects the active cap', () => {
    // reputation 0 → cap 1
    useContractStore.getState().setAvailable([mk(), mk({ id: 'c2' })])
    expect(useContractStore.getState().accept('c1')).toBe(true)
    expect(useContractStore.getState().accept('c2')).toBe(false)
  })

  it('evaluate completes a contract whose target is under a satellite, and rewards the agency', () => {
    const sat = useGameStore.getState().satellites[0]
    const sp = subPoint(sat.elements, 5000) // a point the sat is directly over at t=5000
    // sat[0] has capability 'imaging'; quake contract prefers 'imaging' → match
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon })])
    useContractStore.getState().accept('c1')
    const beforeFunding = useAgencyStore.getState().funding
    const { completed } = useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    expect(completed).toHaveLength(1)
    expect(useContractStore.getState().contracts[0].status).toBe('completed')
    // sat[0] is imaging, preferredCapability is imaging → matched → bonus applied
    expect(useAgencyStore.getState().funding).toBe(beforeFunding + matchBonusFunding(200, true))
  })

  it('evaluate fails a contract past its deadline', () => {
    useContractStore.getState().setAvailable([mk({ lat: 90, lon: 0 })])
    useContractStore.getState().accept('c1')
    // Force a past deadline on the now-active contract so evaluate can fail it.
    useContractStore.setState((s) => ({
      contracts: s.contracts.map((c) => c.id === 'c1' ? { ...c, deadline: 10 } : c),
    }))
    const { failed } = useContractStore.getState().evaluate(useGameStore.getState().satellites, 999)
    expect(failed).toHaveLength(1)
    expect(useContractStore.getState().contracts.find((c) => c.id === 'c1')!.status).toBe('failed')
  })

  it('evaluate drops an expired available contract with no rep change', () => {
    useContractStore.getState().setAvailable([mk({ deadline: 10 })])
    const repBefore = useAgencyStore.getState().reputation
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 999)
    const cs = useContractStore.getState().contracts
    expect(cs.filter((c) => c.id === 'c1')).toHaveLength(0)
    expect(useAgencyStore.getState().reputation).toBe(repBefore)
  })

  it('accept refuses an already-expired contract', () => {
    useContractStore.getState().setAvailable([mk({ deadline: 10 })])
    // simNow() will be much larger than 10 in any test environment
    const ok = useContractStore.getState().accept('c1')
    expect(ok).toBe(false)
    expect(useContractStore.getState().contracts[0].status).toBe('available')
  })

  it('setAvailable refreshes an existing available contract deadline', () => {
    useContractStore.getState().setAvailable([mk({ deadline: 100 })])
    useContractStore.getState().setAvailable([mk({ deadline: 999_999 })])
    const c = useContractStore.getState().contracts.find((x) => x.id === 'c1')!
    expect(c.deadline).toBe(999_999)
    expect(c.status).toBe('available')
  })

  it('evaluate awards match bonus funding when satellite capability matches', () => {
    const sat = useGameStore.getState().satellites[0] // imaging capability
    const sp = subPoint(sat.elements, 5000)
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon, preferredCapability: 'imaging' })])
    useContractStore.getState().accept('c1')
    const before = useAgencyStore.getState().funding
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    const expected = matchBonusFunding(200, true)
    expect(useAgencyStore.getState().funding).toBe(before + expected)
    expect(expected).toBeGreaterThan(200) // sanity: bonus was actually applied
  })

  it('evaluate awards base funding when satellite capability does not match', () => {
    const sat = useGameStore.getState().satellites[0] // imaging capability
    const sp = subPoint(sat.elements, 5000)
    // Use thermal as preferred — imaging sat won't match
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon, preferredCapability: 'thermal' })])
    useContractStore.getState().accept('c1')
    const before = useAgencyStore.getState().funding
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    expect(useAgencyStore.getState().funding).toBe(before + 200) // base, no bonus
  })

  it('completed items include completedBy and matched fields', () => {
    const sat = useGameStore.getState().satellites[0] // imaging
    const sp = subPoint(sat.elements, 5000)
    // matching capability
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon, preferredCapability: 'imaging' })])
    useContractStore.getState().accept('c1')
    const { completed } = useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    expect(completed).toHaveLength(1)
    expect(completed[0].completedBy).toBe(sat.id)
    expect(completed[0].matched).toBe(true)
  })

  it('two consecutive completions raise streak to 2 and set multiplier > 1 on the second', () => {
    const sat = useGameStore.getState().satellites[0]
    const sp = subPoint(sat.elements, 5000)

    // First completion — streak becomes 1, multiplier = 1.0
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon })])
    useContractStore.getState().accept('c1')
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    expect(useGameStore.getState().streak).toBe(1)
    const firstEvent = useContractStore.getState().lastCompletion
    expect(firstEvent).not.toBeNull()
    expect(firstEvent!.streak).toBe(1)
    expect(firstEvent!.multiplier).toBe(1.0)

    // Reset contracts but NOT gameStore streak (streak persists across completions).
    useContractStore.getState().resetForTest()
    useContractStore.getState().setAvailable([mk({ id: 'c2', lat: sp.lat, lon: sp.lon })])
    useContractStore.getState().accept('c2')

    const beforeFunding = useAgencyStore.getState().funding
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)

    // Second completion — streak should now be 2, multiplier > 1.
    expect(useGameStore.getState().streak).toBe(2)
    const secondEvent = useContractStore.getState().lastCompletion
    expect(secondEvent).not.toBeNull()
    expect(secondEvent!.streak).toBe(2)
    expect(secondEvent!.multiplier).toBeGreaterThan(1)

    // The awarded funding reflects the multiplier (single award, already applied).
    const expectedBase = matchBonusFunding(200, true) // matched, base bonus applied
    const expectedMultiplied = Math.round(expectedBase * secondEvent!.multiplier)
    expect(useAgencyStore.getState().funding - beforeFunding).toBe(expectedMultiplied)
  })

  it('a failure resets the streak', () => {
    const sat = useGameStore.getState().satellites[0]
    const sp = subPoint(sat.elements, 5000)

    // Complete one contract to build streak.
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon })])
    useContractStore.getState().accept('c1')
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    expect(useGameStore.getState().streak).toBe(1)

    // Fail a different contract (unreachable target, past deadline).
    useContractStore.getState().setAvailable([mk({ id: 'c2', lat: 89, lon: 0 })])
    useContractStore.getState().accept('c2')
    useContractStore.setState((s) => ({
      contracts: s.contracts.map((c) => c.id === 'c2' ? { ...c, deadline: 10 } : c),
    }))
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 999)
    expect(useGameStore.getState().streak).toBe(0)
  })

  it('hydrate backfills archetype and preferredCapability from kind', () => {
    // Simulate an old persisted contract without the new fields
    saveJSON('hyperion-contracts-v1', {
      contracts: [{
        id: 'c-old', eventId: 'e-old', title: 'Old contract', kind: 'wildfire',
        lat: 0, lon: 0, deadline: FAR_FUTURE,
        reward: { funding: 100, reputation: 5 }, status: 'available',
        // archetype and preferredCapability intentionally omitted (old format)
      }],
      targetId: null,
    })
    useContractStore.getState().hydrate()
    const c = useContractStore.getState().contracts[0]
    expect(c.archetype).toBe('relief')           // wildfire → relief
    expect(c.preferredCapability).toBe('thermal') // wildfire → thermal
  })

  it('evaluate sets reliefImpact on lastCompletion for a relief contract', () => {
    const sat = useGameStore.getState().satellites[0]
    const sp = subPoint(sat.elements, 5000)
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon, kind: 'earthquake', archetype: 'relief' })])
    useContractStore.getState().accept('c1')
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    const ev = useContractStore.getState().lastCompletion
    expect(ev).not.toBeNull()
    expect(ev!.reliefImpact).toBeTruthy()
    expect(ev!.reliefImpact).toMatch(/relief|responder/i)
  })

  it('evaluate leaves reliefImpact undefined for a non-relief contract', () => {
    const sat = useGameStore.getState().satellites[0]
    const sp = subPoint(sat.elements, 5000)
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon, archetype: 'research' })])
    useContractStore.getState().accept('c1')
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    const ev = useContractStore.getState().lastCompletion
    expect(ev).not.toBeNull()
    expect(ev!.reliefImpact).toBeUndefined()
  })

  it('Fix 3: trick-shot completion writes a notable-pass note containing "Trick-shot"', () => {
    const sat = useGameStore.getState().satellites[0]
    const sp = subPoint(sat.elements, 5000)
    // Simulate a trick-shot by injecting lastTrickShot into gameStore before evaluate.
    useGameStore.setState({ lastTrickShot: { count: 3 } })
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon })])
    useContractStore.getState().accept('c1')
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    const satAfter = useGameStore.getState().satellites.find((s) => s.id === sat.id)!
    // The completing satellite should have a notable pass containing "Trick-shot"
    expect(satAfter.record.notablePasses.some((p) => p.includes('Trick-shot'))).toBe(true)
  })

  it('Fix 3: non-trick-shot completion does not write a Trick-shot note', () => {
    const sat = useGameStore.getState().satellites[0]
    const sp = subPoint(sat.elements, 5000)
    // Ensure no trick-shot in state
    useGameStore.setState({ lastTrickShot: null })
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon })])
    useContractStore.getState().accept('c1')
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    const satAfter = useGameStore.getState().satellites.find((s) => s.id === sat.id)!
    expect(satAfter.record.notablePasses.some((p) => p.includes('Trick-shot'))).toBe(false)
  })

  it('Fix 4: lastManeuver is null after evaluate consumes it via a completion', () => {
    const sat = useGameStore.getState().satellites[0]
    const sp = subPoint(sat.elements, 5000)
    // Pre-set a lastManeuver and lastTrickShot
    useGameStore.setState({ lastManeuver: { grade: 'A', efficiency: 0.9, precision: 0.8, overall: 0.85 }, lastTrickShot: { count: 2 } })
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon })])
    useContractStore.getState().accept('c1')
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    // After evaluate with a completion, both should be cleared
    expect(useGameStore.getState().lastManeuver).toBeNull()
    expect(useGameStore.getState().lastTrickShot).toBeNull()
  })

  it('Fix 4: lastManeuver is NOT cleared when no contract completes in the tick', () => {
    // Set a lastManeuver, but run evaluate with no contract in play
    useGameStore.setState({ lastManeuver: { grade: 'S', efficiency: 1, precision: 1, overall: 1 }, lastTrickShot: null })
    useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    // No completion → maneuver grade should still be there
    expect(useGameStore.getState().lastManeuver).not.toBeNull()
  })
})
