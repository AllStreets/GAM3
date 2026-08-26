import { create } from 'zustand'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import type { Arc } from '@/lib/storyProgress'

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
}

const DEFAULTS: Persisted = {
  arcs: [],
  dispatches: [],
  lastStoryAt: 0,
}

interface StoryState extends Persisted {
  addDispatch(d: Dispatch): void
  upsertArc(a: Arc): void
  hydrate(): void
  resetForTest(): void
}

export const useStoryStore = create<StoryState>((set, get) => ({
  ...DEFAULTS,

  addDispatch: (d) => {
    const next = [d, ...get().dispatches].slice(0, MAX_DISPATCHES)
    set({ dispatches: next, lastStoryAt: d.at })
    saveJSON(KEY, { arcs: get().arcs, dispatches: next, lastStoryAt: d.at })
  },

  upsertArc: (a) => {
    const existing = get().arcs.filter((x) => x.id !== a.id)
    const arcs = [...existing, a]
    set({ arcs })
    saveJSON(KEY, { arcs, dispatches: get().dispatches, lastStoryAt: get().lastStoryAt })
  },

  hydrate: () => {
    const saved = loadJSON<Persisted>(KEY, DEFAULTS)
    set({
      arcs: saved.arcs ?? [],
      dispatches: saved.dispatches ?? [],
      lastStoryAt: saved.lastStoryAt ?? 0,
    })
  },

  resetForTest: () => {
    clearKey(KEY)
    set({ ...DEFAULTS })
  },
}))
