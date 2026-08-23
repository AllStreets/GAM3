'use client'

import { useEffect, useState } from 'react'
import { useWorldStore, startEventPolling } from '@/state/worldStore'
import type { EventKind } from '@/lib/worldEvents'

const GLYPH: Record<EventKind, { char: string; cls: string }> = {
  quake: { char: '◉', cls: 'text-[#ff5c49]' },
  wildfire: { char: '▲', cls: 'text-[#ffa14a]' },
  storm: { char: '◎', cls: 'text-[#9a7bff]' },
  launch: { char: '▶', cls: 'text-[#45d8ff]' },
}

function timeAgo(iso: string, now: number): string {
  const s = Math.round((now - Date.parse(iso)) / 1000)
  if (!Number.isFinite(s)) return ''
  if (s < 0) return `T-${Math.floor(-s / 3600)}h${Math.floor((-s % 3600) / 60)}m`
  if (s < 90) return `${s}s ago`
  if (s < 5400) return `${Math.round(s / 60)}m ago`
  if (s < 172800) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export default function EventsPanel() {
  const events = useWorldStore((s) => s.events)
  const focusedId = useWorldStore((s) => s.focusedId)
  const sourcesOk = useWorldStore((s) => s.sourcesOk)
  const focusEvent = useWorldStore((s) => s.focusEvent)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const clock = setInterval(() => setNow(Date.now()), 30_000)
    const stop = startEventPolling()
    return () => {
      clearInterval(clock)
      stop()
    }
  }, [])

  return (
    <aside className="pointer-events-auto fixed left-6 top-16 z-20 w-80 font-mono text-xs text-[var(--text)]">
      <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
        <h2 className="mb-2 flex items-center justify-between text-[10px] tracking-[0.35em] text-[var(--accent)]">
          <span>EVENTS</span>
          <span className={`flex items-center gap-1.5 ${sourcesOk ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${sourcesOk ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
            {sourcesOk ? 'LIVE' : 'DEGRADED'}
          </span>
        </h2>
        {events.length === 0 ? (
          <p className="py-4 text-center opacity-50">listening to the world…</p>
        ) : (
          <ul className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
            {events.map((ev) => {
              const g = GLYPH[ev.kind]
              const focused = ev.id === focusedId
              return (
                <li key={ev.id}>
                  <button
                    onClick={() => focusEvent(focused ? null : ev.id)}
                    className={`w-full rounded border px-2 py-1.5 text-left transition ${
                      focused ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-transparent hover:border-white/20'
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className={g.cls}>{g.char}</span>
                      <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                      <span className="shrink-0 tabular-nums opacity-50">
                        {now === null ? '' : timeAgo(ev.time, now)}
                      </span>
                    </span>
                    {ev.detail && <span className="mt-0.5 block truncate pl-5 opacity-50">{ev.detail}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </aside>
  )
}
