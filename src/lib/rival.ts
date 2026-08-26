/**
 * rival.ts — pure deterministic functions for the rival agency system.
 * No Math.random, no Date.now, no side effects.
 */

export interface Rival {
  name: string
  emblemId: string
  archetype: string
  reputation: number
  wins: number
  losses: number
}

// ─── Deterministic hash ──────────────────────────────────────────────────────

/**
 * Cheap deterministic hash over a string, returning a positive integer.
 * Sum of (charCode * position + 31) for each character.
 */
function hashStr(s: string): number {
  let h = 17
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff
  }
  return h
}

// ─── Rival roster ────────────────────────────────────────────────────────────

// Fixed rivals by archetype — one contrasting option per player archetype + default
const RIVALS: Rival[] = [
  {
    name: 'VANTIS Corp',
    emblemId: 'hex-eye',
    archetype: 'defense',
    reputation: 42,
    wins: 0,
    losses: 0,
  },
  {
    name: 'Meridian Watch',
    emblemId: 'arc-wave',
    archetype: 'research',
    reputation: 38,
    wins: 0,
    losses: 0,
  },
  {
    name: 'Solace Orbital',
    emblemId: 'crest-cross',
    archetype: 'relief',
    reputation: 40,
    wins: 0,
    losses: 0,
  },
]

// Contrasting archetype map: given player archetype → pick the rival with a
// different (contrasting) specialisation to maximise narrative tension.
const CONTRAST_INDEX: Record<string, number> = {
  relief: 0,   // player is relief → VANTIS (defense) contrasts
  research: 0, // player is research → VANTIS (defense) contrasts
  defense: 1,  // player is defense → Meridian Watch (research) contrasts
}

/**
 * Seed the starting rival deterministically from the player's archetype.
 * Returns a rival whose specialisation contrasts the player's for narrative tension.
 */
export function seedRival(playerArchetype: string | null): Rival {
  const idx = playerArchetype !== null ? (CONTRAST_INDEX[playerArchetype] ?? 0) : 0
  return { ...RIVALS[idx] }
}

// ─── rivalEtaSec ────────────────────────────────────────────────────────────

/**
 * Deterministic pseudo-ETA (in sim-seconds from acceptance) for the rival to
 * complete a contract. Returns a value strictly in (0, deadlineSec).
 *
 * Higher difficulty → rival is proportionally faster (lower ETA fraction).
 */
export function rivalEtaSec(contractId: string, deadlineSec: number, difficulty: number): number {
  const h = hashStr(contractId)
  // Base fraction in [0.35, 0.85] from the hash
  const baseFraction = 0.35 + (h % 1000) / 2000 // range: 0.35 .. 0.85
  // Difficulty compresses the fraction toward the lower bound (rival is faster)
  const diff = Math.min(1, Math.max(0, difficulty))
  const fraction = baseFraction * (1 - diff * 0.4) // difficulty squeezes up to 40% off
  return Math.round(Math.max(1, deadlineSec * fraction))
}

// ─── resolveRace ────────────────────────────────────────────────────────────

/**
 * Determine who won the race.
 * Player wins if they completed (non-null) at or before the rival ETA.
 * Ties go to the player.
 */
export function resolveRace(
  playerCompletedAtSec: number | null,
  rivalEtaSecValue: number,
): 'player' | 'rival' {
  if (playerCompletedAtSec === null) return 'rival'
  return playerCompletedAtSec <= rivalEtaSecValue ? 'player' : 'rival'
}

// ─── applyRaceResult ────────────────────────────────────────────────────────

/**
 * Update rival wins/losses and reputation from a race outcome.
 * Player win → rival.losses++, rival.reputation -3 (min 0).
 * Rival win → rival.wins++, rival.reputation +4.
 * Returns a new Rival object (does not mutate input).
 */
export function applyRaceResult(r: Rival, result: 'player' | 'rival'): Rival {
  if (result === 'player') {
    return {
      ...r,
      losses: r.losses + 1,
      reputation: Math.max(0, r.reputation - 3),
    }
  } else {
    return {
      ...r,
      wins: r.wins + 1,
      reputation: r.reputation + 4,
    }
  }
}
