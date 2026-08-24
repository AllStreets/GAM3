'use client'

import { useEffect, useState } from 'react'
import { useContractStore } from '@/state/contractStore'
import { useWorldStore } from '@/state/worldStore'
import { useAgencyStore } from '@/state/agencyStore'
import { useGameStore } from '@/state/gameStore'
import { simNow, TIME_SCALE } from '@/lib/simTime'
import { maxActiveContracts } from '@/lib/economy'
import { CAPABILITY_LABEL } from '@/lib/satelliteMeta'
import { audio } from '@/audio/AudioEngine'
import type { Archetype } from '@/lib/archetype'

const ARCHETYPE_STYLE: Record<Archetype, { label: string; color: string }> = {
  relief:   { label: 'RELIEF',   color: '#4ade80' },
  research: { label: 'RESEARCH', color: '#60a5fa' },
  defense:  { label: 'DEFENSE',  color: '#f87171' },
}

function countdown(deadline: number, now: number): string {
  const s = Math.max(0, Math.round((deadline - now) / TIME_SCALE))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

export default function ContractsPanel() {
  const founded = useAgencyStore((s) => s.founded)
  const reputation = useAgencyStore((s) => s.reputation)
  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const accept = useContractStore((s) => s.accept)
  const setTarget = useContractStore((s) => s.setTarget)
  const focusEvent = useWorldStore((s) => s.focusEvent)
  const selectedId = useGameStore((s) => s.selectedId)
  const satellites = useGameStore((s) => s.satellites)
  const selectedCapability = satellites.find((s) => s.id === selectedId)?.capability ?? null

  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(simNow())
    const id = setInterval(() => setNow(simNow()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!founded) return null

  const available = contracts.filter((c) => c.status === 'available')
  const active = contracts.filter((c) => c.status === 'active')
  const done = contracts.filter((c) => c.status === 'completed' || c.status === 'failed').slice(-3)
  const cap = maxActiveContracts(reputation)

  return (
    <aside className="pointer-events-auto w-full font-mono text-xs text-[var(--text)]">
      <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
        <h2 className="mb-2 flex items-center justify-between text-[10px] tracking-[0.35em] text-[var(--accent)]">
          <span>CONTRACTS</span>
          <span className="opacity-60">ACTIVE {active.length}/{cap}</span>
        </h2>

        {available.length > 0 && (
          <ul className="mb-2 space-y-1">
            {available.map((c) => {
              const archStyle = ARCHETYPE_STYLE[c.archetype]
              const capLabel = CAPABILITY_LABEL[c.preferredCapability]
              const isMatch = selectedCapability !== null && selectedCapability === c.preferredCapability
              return (
                <li key={c.id} className="rounded border border-white/10 p-2">
                  <p className="mb-1 truncate font-semibold">{c.title}</p>
                  <p className="mb-1 flex items-center gap-1.5">
                    <span
                      className="rounded px-1 py-0.5 text-[9px] font-bold tracking-widest"
                      style={{ color: archStyle.color, border: `1px solid ${archStyle.color}40`, background: `${archStyle.color}14` }}
                    >
                      {archStyle.label}
                    </span>
                    <span className="rounded border border-white/15 px-1 py-0.5 text-[9px] tracking-widest opacity-60">{capLabel}</span>
                    {isMatch && (
                      <span className="text-[9px] text-yellow-400 opacity-80">★ match</span>
                    )}
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="tabular-nums opacity-70" style={{ color: 'var(--accent)' }}>§{c.reward.funding} · REP {c.reward.reputation}</span>
                    <button
                      onClick={() => { if (accept(c.id)) audio.alert() }}
                      disabled={active.length >= cap}
                      className="rounded border border-[var(--accent)]/40 px-2 py-0.5 text-[10px] text-[var(--accent)] transition enabled:hover:bg-[var(--accent)]/10 disabled:opacity-30"
                    >
                      ACCEPT
                    </button>
                  </p>
                </li>
              )
            })}
          </ul>
        )}

        {active.map((c) => (
          <button
            key={c.id}
            onClick={() => { audio.uiTick(); setTarget(c.id); focusEvent(c.eventId) }}
            className={`mb-1 block w-full rounded border p-2 text-left transition ${targetId === c.id ? 'border-[#ffb86b] bg-[#ffb86b]/10' : 'border-white/15 hover:border-white/30'}`}
          >
            <p className="mb-0.5 flex items-center justify-between">
              <span className="truncate font-semibold text-[#ffb86b]">{c.title}</span>
              <span className="shrink-0 tabular-nums opacity-70">{now === null ? '' : `T-${countdown(c.deadline, now)}`}</span>
            </p>
            <p className="opacity-60">Maneuver a satellite over the target · TRACK to view</p>
          </button>
        ))}

        {available.length === 0 && active.length === 0 && (
          <p className="py-3 text-center opacity-50">Awaiting the next briefing…</p>
        )}

        {done.length > 0 && (
          <ul className="mt-2 border-t border-white/10 pt-2 space-y-0.5">
            {done.map((c) => (
              <li key={c.id} className="flex items-center justify-between opacity-50">
                <span className="truncate">{c.title}</span>
                <span className={c.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}>
                  {c.status === 'completed' ? '✓' : '✕'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
