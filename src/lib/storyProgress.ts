/**
 * storyProgress.ts — pure functions for the narrative arc engine.
 * No Math.random, no Date.now, no side effects.
 */

export interface Arc {
  id: string
  theme: string
  tension: number  // 0..1
  beatsSeen: number
}

/**
 * Advance an arc one beat. Escalation raises tension by 0.15; de-escalation
 * drops it by 0.05. Tension is clamped to [0, 1]. beatsSeen always increments.
 */
export function advanceArc(a: Arc, escalate: boolean): Arc {
  const delta = escalate ? 0.15 : -0.05
  const tension = Math.min(1, Math.max(0, a.tension + delta))
  return { ...a, tension, beatsSeen: a.beatsSeen + 1 }
}

// ─── Theme tables ─────────────────────────────────────────────────────────────

const ARCHETYPE_THEMES: Record<string, string[]> = {
  relief:   ['Humanitarian Surge', 'Crisis Response', 'Relief Mobilisation', 'Field Coordination', 'Endurance Watch'],
  research: ['Data Anomaly', 'Pattern Emergence', 'Quiet Observation', 'Signal Convergence', 'Deep Survey'],
  defense:  ['Strategic Silence', 'Eyes On', 'Threat Horizon', 'Dark Watch', 'Operational Patience'],
  null:     ['First Light', 'Agency Origins', 'Initial Tasking', 'Orbital Footprint', 'New Mandate'],
}

const KIND_INDEX: Record<string, number> = {
  earthquake: 0, quake: 0,
  flood: 1,
  fire: 2, wildfire: 2,
  storm: 3, cyclone: 3, typhoon: 3, hurricane: 3,
  volcano: 4,
  drought: 1,
  launch: 2,
  debris: 3,
  maritime: 4,
}

/**
 * Pick a deterministic theme string based on archetype and the dominant kind
 * in recentKinds. No randomness — the same inputs always produce the same output.
 */
export function pickArcTheme(archetype: string | null, recentKinds: string[]): string {
  const key = archetype ?? 'null'
  const themes = ARCHETYPE_THEMES[key] ?? ARCHETYPE_THEMES['null']

  // Find the dominant kind by frequency
  const freq: Record<string, number> = {}
  for (const k of recentKinds) {
    freq[k] = (freq[k] ?? 0) + 1
  }

  let dominantKind = ''
  let maxCount = 0
  for (const [k, c] of Object.entries(freq)) {
    if (c > maxCount || (c === maxCount && k < dominantKind)) {
      maxCount = c
      dominantKind = k
    }
  }

  // Map the dominant kind to a theme index
  const kindIdx = KIND_INDEX[dominantKind.toLowerCase()] ?? 0
  return themes[kindIdx % themes.length]
}
