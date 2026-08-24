export type Archetype = 'relief' | 'research' | 'defense'
export interface Leaning { relief: number; research: number; defense: number }
export const ZERO_LEANING: Leaning = { relief: 0, research: 0, defense: 0 }

export const ARCHETYPE_COLOR: Record<Archetype, string> = {
  relief:   '#ff9955',
  research: '#45d8ff',
  defense:  '#ff5c49',
}

const PRIORITY: Archetype[] = ['relief', 'research', 'defense']

export function advanceLeaning(l: Leaning, tag: Archetype, weight = 1): Leaning {
  return { ...l, [tag]: (l[tag] ?? 0) + weight }
}

export function dominantArchetype(l: Leaning): Archetype | null {
  const max = Math.max(l.relief, l.research, l.defense)
  if (max <= 0) return null
  return PRIORITY.find((a) => l[a] === max) ?? null
}

const DESCRIPTOR: Record<Archetype, string> = {
  relief: 'Relief Command',
  research: 'Science Directorate',
  defense: 'Strategic Watch',
}

export function archetypeDescriptor(a: Archetype | null): string {
  return a ? DESCRIPTOR[a] : 'Startup Outfit'
}

const RANKS = ['Provisional', 'Chartered', 'Established', 'Distinguished', 'Legendary']

function rankTier(reputation: number): string {
  return RANKS[Math.min(RANKS.length - 1, Math.floor(reputation / 120))]
}

export function archetypeTitle(a: Archetype | null, reputation: number): string {
  const d = archetypeDescriptor(a)
  return a ? `${rankTier(reputation)} · ${d}` : d
}
