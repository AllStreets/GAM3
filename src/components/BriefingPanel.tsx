'use client'

import { useEffect, useRef, useState } from 'react'
import { useWorldStore } from '@/state/worldStore'
import { useGameStore } from '@/state/gameStore'
import { propagate, ER_KM, orbitalPeriod } from '@/lib/orbits'
import { simNow } from '@/lib/simTime'
import { profileSummary, recordSession } from '@/lib/profile'
import { audio } from '@/audio/AudioEngine'
import { useContractStore } from '@/state/contractStore'
import { contractsFromBriefing, seedContracts, type BriefingMission } from '@/lib/contractsFromBriefing'
import { useAgencyStore, agencyArchetype } from '@/state/agencyStore'
import { triggerStory } from '@/lib/storyTrigger'

interface Briefing {
  headline: string
  situation: string
  advisory: string
  missions: BriefingMission[]
}

export default function BriefingPanel() {
  const events = useWorldStore((s) => s.events)
  const focusEvent = useWorldStore((s) => s.focusEvent)
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const requested = useRef(false)

  useEffect(() => {
    if (requested.current || events.length === 0) return
    requested.current = true
    recordSession()

    const fleet = useGameStore.getState().satellites.map((sat) => {
      const { position } = propagate(sat.elements, simNow())
      return {
        name: sat.name,
        altKm: Math.round((position.length() - 1) * ER_KM),
        fuelPct: Math.round((sat.fuel / sat.fuelCapacity) * 100),
      }
    })

    const agencyState = useAgencyStore.getState()
    // Fire story engine on session start alongside the briefing call
    triggerStory(events)

    void fetch('/api/briefing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profile: profileSummary(),
        fleet,
        events: events.slice(0, 25).map((e) => ({
          id: e.id, kind: e.kind, title: e.title, severity: e.severity, time: e.time,
        })),
        agency: {
          name: agencyState.name,
          archetype: agencyArchetype(),
        },
      }),
    })
      .then((r) => r.json())
      .then((data: { briefing: Briefing }) => {
        setBriefing(data.briefing)
        audio.chirp()
        const now = simNow()
        const sats = useGameStore.getState().satellites
        const period = orbitalPeriod(sats[0].elements.a)
        const fromAI = contractsFromBriefing(data.briefing.missions, events, now, period, sats)
        const contracts = fromAI.length ? fromAI : seedContracts(events, now, period, sats)
        useContractStore.getState().setAvailable(contracts)
      })
      .catch(() => {})
  }, [events])

  if (!briefing || dismissed) return null

  return (
    <aside className="pointer-events-auto fixed bottom-6 left-6 z-20 w-96 font-mono text-xs text-[var(--text)]">
      <section className="rounded border border-[var(--accent)]/30 bg-black/70 p-4 backdrop-blur">
        <header className="mb-2 flex items-start justify-between">
          <h2 className="text-[10px] tracking-[0.35em] text-[var(--accent)]">SITUATION BRIEFING</h2>
          <button onClick={() => setDismissed(true)} className="opacity-50 hover:opacity-100">✕</button>
        </header>
        <p className="mb-2 text-sm font-semibold tracking-wide">{briefing.headline}</p>
        <p className="mb-2 leading-relaxed opacity-85">{briefing.situation}</p>
        <p className="mb-3 border-l-2 border-[var(--accent)]/50 pl-2 italic opacity-75">{briefing.advisory}</p>
        {briefing.missions.length > 0 && (
          <ul className="space-y-2">
            {briefing.missions.map((m) => (
              <li key={m.eventId + m.title} className="rounded border border-white/10 p-2">
                <p className="mb-0.5 flex items-center justify-between">
                  <span className="font-semibold text-[#ffb86b]">{m.title}</span>
                  <button
                    onClick={() => { audio.uiTick(); focusEvent(m.eventId) }}
                    className="rounded border border-[var(--accent)]/40 px-1.5 py-0.5 text-[10px] text-[var(--accent)] hover:bg-[var(--accent)]/10"
                  >
                    TRACK
                  </button>
                </p>
                <p className="opacity-70">{m.objective}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
