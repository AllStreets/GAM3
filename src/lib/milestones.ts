/**
 * Pure deterministic helpers for the "earned safety net" milestone system.
 *
 * Every 5th contract completion:
 *   - grants a relief funding award (scales with tier)
 *   - grants an emergency-refit token (free full-refuel of one stranded satellite)
 *
 * No Zustand imports — all state comes in via parameters so the logic is
 * fully testable in isolation.
 */

export interface Milestones {
  /** Total contract completions recorded since agency founding. */
  completed: number
  /** How many relief grants have been claimed (= floor(completed/5)). */
  reliefGrantsClaimed: number
  /** Available emergency-refit tokens (earned at 5th, 10th, … completion). */
  refitTokens: number
}

/** Return a zeroed Milestones object (default for a new agency). */
export function freshMilestones(): Milestones {
  return { completed: 0, reliefGrantsClaimed: 0, refitTokens: 0 }
}

/**
 * Relief grant amount at a given completion count (only meaningful at
 * multiples of 5 — the tier when the grant is actually issued).
 *
 * Scale: §200 at 5 completions, +§40 per additional tier.
 * So: tier 1 (5th) = 200, tier 2 (10th) = 240, tier 3 (15th) = 280, …
 */
export function reliefGrantAmount(completed: number): number {
  const tier = Math.floor(completed / 5)
  return 200 + 40 * (tier - 1)
}

export interface AccrueResult {
  milestones: Milestones
  grantedFunding: number
  grantedTokens: number
}

/**
 * Increment `completed` by 1 and check for milestone awards.
 *
 * Every 5th completion triggers a tier grant:
 *   grantedFunding = reliefGrantAmount(newCompleted)
 *   grantedTokens  = 1
 *
 * In-between completions produce grantedFunding=0 / grantedTokens=0.
 *
 * Deterministic — no random, no Date.now, no side effects.
 */
export function accrueOnCompletion(m: Milestones): AccrueResult {
  const newCompleted = m.completed + 1

  if (newCompleted % 5 === 0) {
    const grantedFunding = reliefGrantAmount(newCompleted)
    const grantedTokens = 1
    return {
      milestones: {
        completed: newCompleted,
        reliefGrantsClaimed: m.reliefGrantsClaimed + 1,
        refitTokens: m.refitTokens + grantedTokens,
      },
      grantedFunding,
      grantedTokens,
    }
  }

  return {
    milestones: {
      completed: newCompleted,
      reliefGrantsClaimed: m.reliefGrantsClaimed,
      refitTokens: m.refitTokens,
    },
    grantedFunding: 0,
    grantedTokens: 0,
  }
}
