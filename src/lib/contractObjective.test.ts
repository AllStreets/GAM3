import { describe, it, expect } from 'vitest'
import {
  freshProgress,
  defaultObjective,
  evaluateObjective,
  objectiveRewardScale,
  type Objective,
  type ObjectiveProgress,
} from './contractObjective'

// ---------------------------------------------------------------------------
// freshProgress
// ---------------------------------------------------------------------------
describe('freshProgress', () => {
  it('returns a zeroed progress record', () => {
    const p = freshProgress()
    expect(p.passesDone).toBe(0)
    expect(p.satsSeen).toEqual([])
    expect(p.dwellAccumSec).toBe(0)
    expect(p.done).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// defaultObjective
// ---------------------------------------------------------------------------
describe('defaultObjective', () => {
  it('storm → multi-pass', () => {
    expect(defaultObjective('storm', 'imaging').type).toBe('multi-pass')
  })
  it('cyclone → multi-pass', () => {
    expect(defaultObjective('cyclone', 'imaging').type).toBe('multi-pass')
  })
  it('hurricane → multi-pass', () => {
    expect(defaultObjective('hurricane', 'thermal').type).toBe('multi-pass')
  })
  it('launch → multi-sat', () => {
    expect(defaultObjective('launch', 'comms').type).toBe('multi-sat')
  })
  it('rocket → multi-sat', () => {
    expect(defaultObjective('rocket', 'imaging').type).toBe('multi-sat')
  })
  it('comms → dwell', () => {
    expect(defaultObjective('comms', 'comms').type).toBe('dwell')
  })
  it('relay → dwell', () => {
    expect(defaultObjective('relay', 'comms').type).toBe('dwell')
  })
  it('relief → single-pass', () => {
    expect(defaultObjective('relief', 'imaging').type).toBe('single-pass')
  })
  it('quake → single-pass', () => {
    expect(defaultObjective('quake', 'imaging').type).toBe('single-pass')
  })
  it('place → single-pass', () => {
    expect(defaultObjective('place', 'imaging').type).toBe('single-pass')
  })
  it('returns a label and params', () => {
    const o = defaultObjective('storm', 'imaging')
    expect(o.label).toBeTruthy()
    expect(typeof o.label).toBe('string')
    expect(o.params).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// evaluateObjective — single-pass
// ---------------------------------------------------------------------------
describe('evaluateObjective single-pass', () => {
  const obj: Objective = { type: 'single-pass', label: 'Capture target', params: {} }

  it('not done when nothing in range', () => {
    const p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: [], dtSec: 30 })
    expect(p.done).toBe(false)
  })

  it('done the moment any sat is in range', () => {
    const p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: ['sat-1'], dtSec: 30 })
    expect(p.done).toBe(true)
  })

  it('stays done once latched even if in-range becomes empty', () => {
    let p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: ['sat-1'], dtSec: 30 })
    p = evaluateObjective(obj, p, { inRangeSatIds: [], dtSec: 30 })
    expect(p.done).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// evaluateObjective — multi-pass
// ---------------------------------------------------------------------------
describe('evaluateObjective multi-pass', () => {
  const obj: Objective = { type: 'multi-pass', label: 'Monitor storm (3 passes)', params: { passes: 3 } }

  it('no increment when nothing in range', () => {
    const p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: [], dtSec: 30 })
    expect(p.passesDone).toBe(0)
    expect(p.done).toBe(false)
  })

  it('increments passesDone on first in-range entry', () => {
    const p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: ['sat-1'], dtSec: 30 })
    expect(p.passesDone).toBe(1)
    expect(p.done).toBe(false)
  })

  it('does NOT increment while continuously in range', () => {
    let p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: ['sat-1'], dtSec: 30 })
    p = evaluateObjective(obj, p, { inRangeSatIds: ['sat-1'], dtSec: 30 })
    expect(p.passesDone).toBe(1)
  })

  it('increments on re-entry after a gap', () => {
    let p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: ['sat-1'], dtSec: 30 })
    p = evaluateObjective(obj, p, { inRangeSatIds: [], dtSec: 30 })      // exit
    p = evaluateObjective(obj, p, { inRangeSatIds: ['sat-1'], dtSec: 30 }) // re-entry
    expect(p.passesDone).toBe(2)
    expect(p.done).toBe(false)
  })

  it('marks done when passes reaches threshold', () => {
    let p = freshProgress()
    // 3 passes with gaps between
    for (let i = 0; i < 3; i++) {
      p = evaluateObjective(obj, p, { inRangeSatIds: ['sat-1'], dtSec: 30 }) // entry
      p = evaluateObjective(obj, p, { inRangeSatIds: [], dtSec: 30 })        // exit
    }
    expect(p.passesDone).toBe(3)
    expect(p.done).toBe(true)
  })

  it('stays done after latching', () => {
    let p = freshProgress()
    for (let i = 0; i < 3; i++) {
      p = evaluateObjective(obj, p, { inRangeSatIds: ['sat-1'], dtSec: 30 })
      p = evaluateObjective(obj, p, { inRangeSatIds: [], dtSec: 30 })
    }
    p = evaluateObjective(obj, p, { inRangeSatIds: [], dtSec: 30 })
    expect(p.done).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// evaluateObjective — multi-sat
// ---------------------------------------------------------------------------
describe('evaluateObjective multi-sat', () => {
  const obj: Objective = { type: 'multi-sat', label: 'Two satellites required', params: { sats: 2 } }

  it('collects a new satId when in range', () => {
    const p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: ['sat-1'], dtSec: 30 })
    expect(p.satsSeen).toContain('sat-1')
    expect(p.done).toBe(false)
  })

  it('does not duplicate the same satId', () => {
    let p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: ['sat-1'], dtSec: 30 })
    p = evaluateObjective(obj, p, { inRangeSatIds: ['sat-1'], dtSec: 30 })
    expect(p.satsSeen).toHaveLength(1)
  })

  it('marks done when enough distinct sats seen', () => {
    let p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: ['sat-1'], dtSec: 30 })
    p = evaluateObjective(obj, p, { inRangeSatIds: ['sat-2'], dtSec: 30 })
    expect(p.satsSeen).toHaveLength(2)
    expect(p.done).toBe(true)
  })

  it('handles multiple sats in range in one tick', () => {
    const p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: ['sat-1', 'sat-2'], dtSec: 30 })
    expect(p.satsSeen).toHaveLength(2)
    expect(p.done).toBe(true)
  })

  it('stays done after latching', () => {
    let p = freshProgress()
    p = evaluateObjective(obj, p, { inRangeSatIds: ['sat-1', 'sat-2'], dtSec: 30 })
    p = evaluateObjective(obj, p, { inRangeSatIds: [], dtSec: 30 })
    expect(p.done).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// evaluateObjective — dwell
// ---------------------------------------------------------------------------
describe('evaluateObjective dwell', () => {
  const obj: Objective = { type: 'dwell', label: 'Maintain comms 90s', params: { dwellSec: 90 } }

  it('accumulates dwell while in range', () => {
    let p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: ['sat-1'], dtSec: 30 })
    expect(p.dwellAccumSec).toBe(30)
    expect(p.done).toBe(false)
    p = evaluateObjective(obj, p, { inRangeSatIds: ['sat-1'], dtSec: 30 })
    expect(p.dwellAccumSec).toBe(60)
    expect(p.done).toBe(false)
  })

  it('does not accumulate when out of range', () => {
    let p = evaluateObjective(obj, freshProgress(), { inRangeSatIds: [], dtSec: 30 })
    expect(p.dwellAccumSec).toBe(0)
    p = evaluateObjective(obj, p, { inRangeSatIds: [], dtSec: 30 })
    expect(p.dwellAccumSec).toBe(0)
  })

  it('marks done at threshold', () => {
    let p = freshProgress()
    for (let i = 0; i < 3; i++) {
      p = evaluateObjective(obj, p, { inRangeSatIds: ['sat-1'], dtSec: 30 })
    }
    expect(p.dwellAccumSec).toBe(90)
    expect(p.done).toBe(true)
  })

  it('stays done after latching', () => {
    let p = freshProgress()
    for (let i = 0; i < 3; i++) {
      p = evaluateObjective(obj, p, { inRangeSatIds: ['sat-1'], dtSec: 30 })
    }
    p = evaluateObjective(obj, p, { inRangeSatIds: [], dtSec: 30 })
    expect(p.done).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// objectiveRewardScale
// ---------------------------------------------------------------------------
describe('objectiveRewardScale', () => {
  it('single-pass returns 1.0', () => {
    const o = defaultObjective('quake', 'imaging')
    expect(objectiveRewardScale(o)).toBe(1.0)
  })

  it('multi-pass returns > 1.0', () => {
    const o = defaultObjective('storm', 'imaging')
    expect(objectiveRewardScale(o)).toBeGreaterThan(1.0)
  })

  it('multi-sat returns > 1.0', () => {
    const o = defaultObjective('launch', 'comms')
    expect(objectiveRewardScale(o)).toBeGreaterThan(1.0)
  })

  it('dwell returns > 1.0', () => {
    const o = defaultObjective('comms', 'comms')
    expect(objectiveRewardScale(o)).toBeGreaterThan(1.0)
  })

  it('all scales are <= 1.8', () => {
    const kinds = ['quake', 'storm', 'launch', 'comms']
    for (const k of kinds) {
      const o = defaultObjective(k, 'imaging')
      expect(objectiveRewardScale(o)).toBeLessThanOrEqual(1.8)
    }
  })
})
