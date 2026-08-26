import { create } from 'zustand'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import type { Arc } from '@/lib/storyProgress'
import { seedRival, type Rival } from '@/lib/rival'

const KEY = 'hyperion-story-v1'
const MAX_DISPATCHES = 20

export interface Dispatch {
  id: string
  at: number
  text: string
  source: 'story' | 'rival'
}

interface Persisted {
  arcs: Arc[]
  dispatches: Dispatch[]
  lastStoryAt: number
  rival: Rival
}

const DEFAULTS: Persisted = {
  arcs: [],
  dispatches: [],
  lastStoryAt: 0,
  rival: seedRival(null),
}

interface StoryState extends Persisted {
  addDispatch(d: Dispatch): void
  upsertArc(a: Arc): void
  setRival(r: Rival): void
  hydrate(): void
  resetForTest(): void
}

function persistPayload(s: Pick<Persisted, 'arcs' | 'dispatches' | 'lastStoryAt' | 'rival'>): Persisted {
  return { arcs: s.arcs, dispatches: s.dispatches, lastStoryAt: s.lastStoryAt, rival: s.rival }
}

export const useStoryStore = create<StoryState>((set, get) => ({
  ...DEFAULTS,

  addDispatch: (d) => {
    const next = [d, ...get().dispatches].slice(0, MAX_DISPATCHES)
    set({ dispatches: next, lastStoryAt: d.at })
    saveJSON(KEY, persistPayload({ ...get(), dispatches: next, lastStoryAt: d.at }))
  },

  upsertArc: (a) => {
    const existing = get().arcs.filter((x) => x.id !== a.id)
    const arcs = [...existing, a]
    set({ arcs })
    saveJSON(KEY, persistPayload({ ...get(), arcs }))
  },

  setRival: (r) => {
    set({ rival: r })
    saveJSON(KEY, persistPayload({ ...get(), rival: r }))
  },

  hydrate: () => {
    const saved = loadJSON<Persisted>(KEY, DEFAULTS)
    set({
      arcs: saved.arcs ?? [],
      dispatches: saved.dispatches ?? [],
      lastStoryAt: saved.lastStoryAt ?? 0,
      // Back-compat: old saves won't have rival; seed a default
      rival: saved.rival ?? seedRival(null),
    })
  },

  resetForTest: () => {
    clearKey(KEY)
    set({ ...DEFAULTS })
  },
}))

// Expose the store on window in non-production so Playwright e2e tests can
// seed dispatches and inspect story state without relying on the AI route.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  ;(window as unknown as Record<string, unknown>).__storyStore = useStoryStore
}
