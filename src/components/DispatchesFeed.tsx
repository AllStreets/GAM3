'use client'

import { useState } from 'react'
import { useStoryStore } from '@/state/storyStore'
import { Chip } from '@/components/ui/Chip'

// Source accent colours
const STORY_COLOR = '#45d8ff'  // var(--accent) equivalent
const RIVAL_COLOR = '#ffa14a'  // warm amber — distinct from story but not harsh

export default function DispatchesFeed() {
  const dispatches = useStoryStore((s) => s.dispatches)
  const [collapsed, setCollapsed] = useState(false)

  // Non-nagging: hidden entirely when empty
  if (dispatches.length === 0) return null

  const visible = dispatches.slice(0, 5)

  return (
    <div className="pointer-events-auto w-80 font-mono text-xs text-[var(--text)]">
      <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-[10px] tracking-[0.35em] text-[var(--accent)]">DISPATCHES</h2>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-[10px] tracking-wider opacity-50 hover:opacity-100 transition-opacity"
            aria-label={collapsed ? 'Expand dispatches' : 'Collapse dispatches'}
          >
            {collapsed ? '▼' : '▲'}
          </button>
        </header>
        {!collapsed && (
          <ul className="space-y-2">
            {visible.map((d) => (
              <li key={d.id} className="flex flex-col gap-0.5">
                <p
                  className="leading-relaxed opacity-85"
                  style={{ color: d.source === 'rival' ? RIVAL_COLOR : undefined }}
                >
                  {d.text}
                </p>
                <div className="flex items-center gap-1.5">
                  <Chip
                    color={d.source === 'rival' ? RIVAL_COLOR : STORY_COLOR}
                    className="opacity-70"
                  >
                    {d.source === 'rival' ? 'RIVAL' : 'COMM'}
                  </Chip>
                  <span className="text-[9px] opacity-40 tabular-nums">
                    {new Date(d.at).toISOString().slice(11, 19)} UTC
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
