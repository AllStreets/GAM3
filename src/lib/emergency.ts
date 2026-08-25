/**
 * Pure, deterministic emergency logic — no React, no Three.js, no Math.random,
 * no Date.now. All randomness is injected as `roll` from the caller.
 */

export interface Conjunction {
  satId: string
  startedAt: number
  deadline: number
  requiredDv: number
}

/** Chance per fleet member that a conjunction spawns on any given check.
 *  Kept low so emergencies stay rare, memorable gut-punches rather than spammy. */
const PER_FLEET_CHANCE = 0.08

/**
 * Returns true when all three conditions are met:
 *  1. Enough sim-seconds have elapsed since the last spawn.
 *  2. The fleet is non-empty.
 *  3. The injected roll falls below perFleetChance(fleetSize).
 *
 * `roll` must be in [0, 1) — supplied by the caller from a deterministic source.
 */
export function shouldSpawnConjunction(opts: {
  now: number
  lastSpawnAt: number
  minGapSec: number
  fleetSize: number
  roll: number
}): boolean {
  const { now, lastSpawnAt, minGapSec, fleetSize, roll } = opts
  if (fleetSize <= 0) return false
  if (now - lastSpawnAt < minGapSec) return false
  return roll < PER_FLEET_CHANCE
}

/**
 * Construct a new Conjunction event.
 *
 * @param satId      Target satellite identifier.
 * @param now        Current sim-time (seconds).
 * @param requiredDv Delta-v the player must spend to evade (m/s). Defaults to 120.
 * @param leadSec    Warning window before the conjunction deadline (sim-sec). Defaults to 240.
 */
export function makeConjunction(
  satId: string,
  now: number,
  requiredDv = 120,
  leadSec = 1200,
): Conjunction {
  return {
    satId,
    startedAt: now,
    deadline: now + leadSec,
    requiredDv,
  }
}

/** True when the player has spent enough delta-v to resolve the event. */
export function isResolvedByBurn(c: Conjunction, dvSpent: number): boolean {
  return dvSpent >= c.requiredDv
}

/** True when the conjunction deadline has passed without resolution. */
export function isExpired(c: Conjunction, now: number): boolean {
  return now > c.deadline
}
