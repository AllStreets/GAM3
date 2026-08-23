import { create } from 'zustand'
import type { WorldEvent } from '@/lib/worldEvents'
import { recordFocus } from '@/lib/profile'

interface WorldState {
  events: WorldEvent[]
  focusedId: string | null
  lastFetch: string | null
  sourcesOk: boolean
  setEvents(events: WorldEvent[], sourcesOk: boolean, fetchedAt: string): void
  focusEvent(id: string | null): void
  resetForTest(): void
}

export const useWorldStore = create<WorldState>((set, get) => ({
  events: [],
  focusedId: null,
  lastFetch: null,
  sourcesOk: true,

  setEvents: (events, sourcesOk, fetchedAt) =>
    set((s) => {
      // Never blank a non-empty world (spec: the game never presents an empty world).
      const next = events.length === 0 && s.events.length > 0 ? s.events : events
      const same =
        next !== s.events &&
        next.length === s.events.length &&
        next.every((e, i) => e.id === s.events[i].id && e.time === s.events[i].time)
      const events2 = same ? s.events : next
      const focusedId =
        s.focusedId && events2.some((e) => e.id === s.focusedId) ? s.focusedId : null
      return { events: events2, sourcesOk, lastFetch: fetchedAt, focusedId }
    }),

  focusEvent: (id) => {
    if (id !== null) {
      const ev = get().events.find((e) => e.id === id)
      if (ev) recordFocus(ev.kind)
    }
    set({ focusedId: id })
  },

  resetForTest: () => set({ events: [], focusedId: null, lastFetch: null, sourcesOk: true }),
}))

/** Browser-only polling loop. Returns a stop function. */
export function startEventPolling(intervalMs = 120_000): () => void {
  if (typeof window === 'undefined') return () => {}

  let stopped = false
  const pull = async () => {
    try {
      const res = await fetch('/api/events')
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as {
        events: WorldEvent[]
        sources: Record<string, string>
        fetchedAt: string
      }
      if (stopped) return
      const sourcesOk = Object.values(data.sources).every((s) => s === 'ok')
      useWorldStore.getState().setEvents(data.events, sourcesOk, data.fetchedAt)
    } catch {
      if (!stopped) useWorldStore.getState().setEvents([], false, new Date().toISOString())
    }
  }

  void pull()
  const id = setInterval(pull, intervalMs)
  return () => {
    stopped = true
    clearInterval(id)
  }
}
