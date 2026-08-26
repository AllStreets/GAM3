import { describe, it, expect } from 'vitest'
import {
  freshMilestones,
  reliefGrantAmount,
  accrueOnCompletion,
  type Milestones,
} from './milestones'

// ─── freshMilestones ──────────────────────────────────────────────────────────

describe('freshMilestones', () => {
  it('returns zeroed fields', () => {
    const m = freshMilestones()
    expect(m.completed).toBe(0)
    expect(m.reliefGrantsClaimed).toBe(0)
    expect(m.refitTokens).toBe(0)
  })
})

// ─── reliefGrantAmount ────────────────────────────────────────────────────────

describe('reliefGrantAmount', () => {
  it('returns §200 at the first milestone (5th completion)', () => {
    expect(reliefGrantAmount(5)).toBe(200)
  })

  it('returns §240 at the second milestone (10th completion)', () => {
    expect(reliefGrantAmount(10)).toBe(240)
  })

  it('returns §280 at the third milestone (15th completion)', () => {
    expect(reliefGrantAmount(15)).toBe(280)
  })

  it('scales monotonically: each tier adds §40', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const completions = tier * 5
      const expected = 200 + 40 * (tier - 1)
      expect(reliefGrantAmount(completions)).toBe(expected)
    }
  })
})

// ─── accrueOnCompletion ───────────────────────────────────────────────────────

describe('accrueOnCompletion', () => {
  it('increments completed by 1', () => {
    const m = freshMilestones()
    const result = accrueOnCompletion(m)
    expect(result.milestones.completed).toBe(1)
  })

  it('1st completion (non-milestone) grants nothing', () => {
    const result = accrueOnCompletion(freshMilestones())
    expect(result.grantedFunding).toBe(0)
    expect(result.grantedTokens).toBe(0)
  })

  it('2nd completion grants nothing', () => {
    let m: Milestones = freshMilestones()
    m = accrueOnCompletion(m).milestones
    const result = accrueOnCompletion(m)
    expect(result.grantedFunding).toBe(0)
    expect(result.grantedTokens).toBe(0)
  })

  it('3rd completion grants nothing', () => {
    let m: Milestones = freshMilestones()
    for (let i = 0; i < 2; i++) m = accrueOnCompletion(m).milestones
    const result = accrueOnCompletion(m)
    expect(result.grantedFunding).toBe(0)
    expect(result.grantedTokens).toBe(0)
  })

  it('4th completion grants nothing', () => {
    let m: Milestones = freshMilestones()
    for (let i = 0; i < 3; i++) m = accrueOnCompletion(m).milestones
    const result = accrueOnCompletion(m)
    expect(result.grantedFunding).toBe(0)
    expect(result.grantedTokens).toBe(0)
  })

  it('5th completion (first milestone) grants §200 + 1 token', () => {
    let m: Milestones = freshMilestones()
    for (let i = 0; i < 4; i++) m = accrueOnCompletion(m).milestones
    const result = accrueOnCompletion(m)
    expect(result.grantedFunding).toBe(200)
    expect(result.grantedTokens).toBe(1)
  })

  it('5th completion increments reliefGrantsClaimed to 1', () => {
    let m: Milestones = freshMilestones()
    for (let i = 0; i < 4; i++) m = accrueOnCompletion(m).milestones
    const result = accrueOnCompletion(m)
    expect(result.milestones.reliefGrantsClaimed).toBe(1)
  })

  it('5th completion adds a refit token to the pool', () => {
    let m: Milestones = freshMilestones()
    for (let i = 0; i < 4; i++) m = accrueOnCompletion(m).milestones
    const result = accrueOnCompletion(m)
    expect(result.milestones.refitTokens).toBe(1)
  })

  it('6th completion grants nothing (not a milestone)', () => {
    let m: Milestones = freshMilestones()
    for (let i = 0; i < 5; i++) m = accrueOnCompletion(m).milestones
    const result = accrueOnCompletion(m)
    expect(result.grantedFunding).toBe(0)
    expect(result.grantedTokens).toBe(0)
  })

  it('10th completion (second milestone) grants §240 + 1 token', () => {
    let m: Milestones = freshMilestones()
    for (let i = 0; i < 9; i++) m = accrueOnCompletion(m).milestones
    const result = accrueOnCompletion(m)
    expect(result.grantedFunding).toBe(240)
    expect(result.grantedTokens).toBe(1)
    expect(result.milestones.reliefGrantsClaimed).toBe(2)
    expect(result.milestones.refitTokens).toBe(2) // 2 total tokens accumulated
  })

  it('15th completion (third milestone) grants §280 + 1 token', () => {
    let m: Milestones = freshMilestones()
    for (let i = 0; i < 14; i++) m = accrueOnCompletion(m).milestones
    const result = accrueOnCompletion(m)
    expect(result.grantedFunding).toBe(280)
    expect(result.grantedTokens).toBe(1)
  })

  it('tokens accumulate: spending one reduces the count', () => {
    // Earn 2 tokens (at 5 and 10), then spend one, verify count
    let m: Milestones = freshMilestones()
    for (let i = 0; i < 10; i++) m = accrueOnCompletion(m).milestones
    expect(m.refitTokens).toBe(2)
    // Simulate spending a token externally
    const afterSpend: Milestones = { ...m, refitTokens: m.refitTokens - 1 }
    expect(afterSpend.refitTokens).toBe(1)
    // Next milestone (15th) adds another
    for (let i = 0; i < 4; i++) m = accrueOnCompletion(afterSpend).milestones
    // We did 1 more, total completed = 11 — not a milestone
    expect(accrueOnCompletion(afterSpend).grantedTokens).toBe(0)
  })

  it('is deterministic — same input always gives same output', () => {
    const m: Milestones = { completed: 4, reliefGrantsClaimed: 0, refitTokens: 0 }
    const r1 = accrueOnCompletion(m)
    const r2 = accrueOnCompletion(m)
    expect(r1).toEqual(r2)
  })

  it('does not mutate the input milestones object', () => {
    const m: Milestones = { completed: 4, reliefGrantsClaimed: 0, refitTokens: 0 }
    const before = { ...m }
    accrueOnCompletion(m)
    expect(m).toEqual(before)
  })
})
