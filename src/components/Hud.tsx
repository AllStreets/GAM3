'use client'

import { useEffect, useState } from 'react'
import FleetPanel from '@/components/FleetPanel'
import EventsPanel from '@/components/EventsPanel'

function utcNow(): string {
  return new Date().toISOString().slice(11, 19) + ' UTC'
}

export default function Hud() {
  const [clock, setClock] = useState<string | null>(null)

  useEffect(() => {
    setClock(utcNow())
    const id = setInterval(() => setClock(utcNow()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-10 p-6 font-mono">
      <header className="flex items-start justify-between">
        <h1 className="text-sm font-semibold tracking-[0.5em] text-[var(--text)]">
          HYPERION
          <span className="mt-1 block h-px w-24 bg-[var(--accent)] opacity-70" />
        </h1>
        <p className="text-xs tabular-nums text-[var(--accent)] opacity-90">
          {clock ?? '--:--:-- UTC'}
        </p>
      </header>
      <FleetPanel />
      <EventsPanel />
    </div>
  )
}
