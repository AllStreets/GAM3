/**
 * Pure contract objective system.
 * No Math.random, no Date.now — fully deterministic and testable.
 */

export type ObjectiveType = 'single-pass' | 'multi-pass' | 'multi-sat' | 'dwell'

export interface Objective {
  type: ObjectiveType
  label: string
  params: { passes?: number; sats?: number; dwellSec?: number }
}

export interface ObjectiveProgress {
  passesDone: number
  satsSeen: string[]
  dwellAccumSec: number
  done: boolean
  /** Internal: whether at least one sat was in range on the PREVIOUS eval call.
   * Used by multi-pass to detect entry transitions. */
  _inRangePrev: boolean
}

export function freshProgress(): ObjectiveProgress {
  return {
    passesDone: 0,
    satsSeen: [],
    dwellAccumSec: 0,
    done: false,
    _inRangePrev: false,
  }
}

const has = (k: string, ...words: string[]) => words.some((w) => k.includes(w))

/**
 * Pick a sensible objective type from the event kind + capability.
 * Storm/cyclone/hurricane → multi-pass (monitoring over time)
 * Launch/rocket/orbit/sat → multi-sat (needs two eyes on it)
 * Comms/relay → dwell (sustained contact)
 * Everything else → single-pass
 */
export function defaultObjective(kind: string, capability: string): Objective {
  const k = kind.toLowerCase()
  const _c = capability.toLowerCase()

  if (has(k, 'storm', 'cyclone', 'hurricane', 'typhoon', 'monitor')) {
    return {
      type: 'multi-pass',
      label: 'Monitor storm — 3 imaging passes',
      params: { passes: 3 },
    }
  }

  if (has(k, 'launch', 'rocket', 'orbit', 'sat')) {
    return {
      type: 'multi-sat',
      label: 'Track launch — 2 satellites',
      params: { sats: 2 },
    }
  }

  if (has(k, 'comms', 'relay')) {
    return {
      type: 'dwell',
      label: 'Maintain comms link — 90s dwell',
      params: { dwellSec: 90 },
    }
  }

  return {
    type: 'single-pass',
    label: 'Capture target — single pass',
    params: {},
  }
}

/**
 * Advance progress by one evaluation tick.
 * Deterministic: given the same inputs, always returns the same output.
 * `done` latches true and never reverts.
 */
export function evaluateObjective(
  o: Objective,
  prog: ObjectiveProgress,
  opts: { inRangeSatIds: string[]; dtSec: number },
): ObjectiveProgress {
  // Once done, always done.
  if (prog.done) return prog

  const inRange = opts.inRangeSatIds.length > 0

  switch (o.type) {
    case 'single-pass': {
      if (inRange) {
        return { ...prog, done: true, _inRangePrev: true }
      }
      return { ...prog, _inRangePrev: false }
    }

    case 'multi-pass': {
      const threshold = o.params.passes ?? 1
      let { passesDone } = prog
      // Count an entry when in range this tick AND was NOT in range previous tick
      const isEntry = inRange && !prog._inRangePrev
      if (isEntry) passesDone += 1
      const done = passesDone >= threshold
      return { ...prog, passesDone, done, _inRangePrev: inRange }
    }

    case 'multi-sat': {
      const threshold = o.params.sats ?? 1
      // Union current satsSeen with any newly in-range sats
      const seenSet = new Set(prog.satsSeen)
      for (const id of opts.inRangeSatIds) seenSet.add(id)
      const satsSeen = Array.from(seenSet)
      const done = satsSeen.length >= threshold
      return { ...prog, satsSeen, done, _inRangePrev: inRange }
    }

    case 'dwell': {
      const threshold = o.params.dwellSec ?? 60
      let { dwellAccumSec } = prog
      if (inRange) dwellAccumSec += opts.dtSec
      const done = dwellAccumSec >= threshold
      return { ...prog, dwellAccumSec, done, _inRangePrev: inRange }
    }
  }
}

/**
 * Scale factor applied to funding on completion. Single-pass = 1.0 (no bonus);
 * complex objectives scale up toward 1.8.
 */
export function objectiveRewardScale(o: Objective): number {
  switch (o.type) {
    case 'single-pass':
      return 1.0
    case 'multi-pass': {
      // 3 passes default: 1.4; scales linearly
      const passes = o.params.passes ?? 1
      return Math.min(1.8, 1.0 + 0.1333 * passes)
    }
    case 'multi-sat': {
      const sats = o.params.sats ?? 1
      return Math.min(1.8, 1.0 + 0.2 * sats)
    }
    case 'dwell': {
      const dwellSec = o.params.dwellSec ?? 60
      // 90s default → 1.3; scales up to 1.8
      return Math.min(1.8, 1.0 + dwellSec / 300)
    }
  }
}
