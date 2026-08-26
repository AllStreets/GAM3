/**
 * storyTrigger.ts — shared helper to call /api/story and push results into
 * storyStore. Used by BriefingPanel (session start) and StoryTrigger component
 * (contract completions). ALWAYS-200; never blocks play.
 */

import { useAgencyStore, agencyArchetype } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { useStoryStore } from '@/state/storyStore'
import { pickArcTheme, advanceArc } from '@/lib/storyProgress'
import type { Arc } from '@/lib/storyProgress'

// Debounce: minimum ms between calls (3 minutes)
const DEBOUNCE_MS = 3 * 60 * 1000
let lastCallAt = 0

interface WorldEvent {
  kind: string
  title: string
  severity: number
}

export function triggerStory(events: WorldEvent[]): void {
  const now = Date.now()
  if (now - lastCallAt < DEBOUNCE_MS) return
  lastCallAt = now

  const agencyState = useAgencyStore.getState()
  const archetype = agencyArchetype()
  const contracts = useContractStore.getState().contracts

  const completed = contracts.filter((c) => c.status === 'completed').length
  const failed = contracts.filter((c) => c.status === 'failed').length
  const lastKinds = contracts
    .filter((c) => c.status === 'completed')
    .slice(-10)
    .map((c) => c.kind)

  void fetch('/api/story', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agency: { name: agencyState.name, archetype },
      recent: { completed, failed, lastKinds },
      events: events.slice(0, 15).map((e) => ({
        kind: e.kind,
        // Sanitise title — never send raw title to influence narrative beyond context
        title: e.title.slice(0, 200),
        severity: e.severity,
      })),
    }),
  })
    .then((r) => r.json())
    .then((data: { dispatches: Array<{ text: string; source: 'story' | 'rival' }>; arcTheme?: string }) => {
      const store = useStoryStore.getState()
      const at = Date.now()

      for (const d of data.dispatches ?? []) {
        store.addDispatch({
          id: `story-${at}-${Math.random().toString(36).slice(2, 7)}`,
          at,
          text: d.text,
          source: d.source,
        })
      }

      // Upsert the main arc
      const arcTheme = data.arcTheme ?? pickArcTheme(archetype, lastKinds)
      const existing: Arc = store.arcs.find((a) => a.id === 'main') ?? {
        id: 'main',
        theme: arcTheme,
        tension: 0.3,
        beatsSeen: 0,
      }
      const escalate = (data.dispatches ?? []).length > 1
      const advanced = advanceArc({ ...existing, theme: arcTheme }, escalate)
      store.upsertArc(advanced)
    })
    .catch(() => {
      // ALWAYS-200 guarantee: silently ignore errors; gameplay is never blocked
    })
}
