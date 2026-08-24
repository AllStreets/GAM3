export const STARTING_FUNDING = 500
export const STARTING_REPUTATION = 0
export const SATELLITE_PRICE = 800

/** Funding to restore `missingMs` m/s of delta-v. */
export function refuelPrice(missingMs: number): number {
  return Math.ceil(Math.max(0, missingMs) * 0.6)
}

const RANKS = ['Startup Outfit', 'Registered Operator', 'Established Agency', 'Trusted Partner', 'Orbital Authority']

export function rankTitle(reputation: number): string {
  const idx = Math.min(RANKS.length - 1, Math.floor(Math.max(0, reputation) / 120))
  return RANKS[idx]
}

/** How many contracts may be active at once, grows with reputation, capped at 5. */
export function maxActiveContracts(reputation: number): number {
  return Math.min(5, 1 + Math.floor(Math.max(0, reputation) / 60))
}

/** Reward for a contract, scaled by the source event's severity (0..1). */
export function contractReward(severity: number): { funding: number; reputation: number } {
  const s = Math.min(1, Math.max(0, severity))
  return { funding: 120 + Math.round(s * 380), reputation: 8 + Math.round(s * 22) }
}

/** Deadline five orbital periods after now — enough headroom to plan and fly an intercept without time pressure dominating. */
export function contractDeadline(simNow: number, periodSec: number): number {
  return simNow + 5 * periodSec
}
