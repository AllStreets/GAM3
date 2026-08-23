'use client'

import { useState } from 'react'
import { useAgencyStore } from '@/state/agencyStore'
import { Emblem, EMBLEMS, COLORWAYS } from '@/components/Emblem'
import { audio } from '@/audio/AudioEngine'
import { useHydrated } from '@/components/StoreHydrator'

const SUGGESTED = 'Aegis Orbital'

export default function FoundingScreen() {
  const hydrated = useHydrated()
  const founded = useAgencyStore((s) => s.founded)
  const found = useAgencyStore((s) => s.found)
  const [name, setName] = useState(SUGGESTED)
  const [emblemId, setEmblemId] = useState(EMBLEMS[0].id)
  const [color, setColor] = useState(COLORWAYS[0])

  if (!hydrated) return null
  if (founded) return null

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm font-mono text-[var(--text)]">
      <div className="w-[560px] max-w-[92vw] rounded-lg border border-white/10 bg-black/70 p-6">
        <p className="text-[10px] tracking-[0.5em] text-[var(--accent)]">HYPERION</p>
        <h1 className="mt-1 mb-4 text-lg font-semibold tracking-wide">Found your agency</h1>

        <label className="mb-1 block text-[11px] opacity-70">AGENCY NAME</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          className="mb-5 w-full rounded border border-white/15 bg-black/50 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />

        <label className="mb-2 block text-[11px] opacity-70">EMBLEM</label>
        <div className="mb-5 grid grid-cols-6 gap-2">
          {EMBLEMS.map((em) => (
            <button
              key={em.id}
              onClick={() => { audio.uiTick(); setEmblemId(em.id) }}
              className={`rounded border p-1 transition ${emblemId === em.id ? 'border-[var(--accent)] bg-white/5' : 'border-white/10 hover:border-white/30'}`}
              title={em.label}
            >
              <Emblem id={em.id} color={color} size={48} />
            </button>
          ))}
        </div>

        <label className="mb-2 block text-[11px] opacity-70">COLORWAY</label>
        <div className="mb-6 flex gap-2">
          {COLORWAYS.map((c) => (
            <button
              key={c}
              onClick={() => { audio.uiTick(); setColor(c) }}
              className={`h-7 w-7 rounded-full border-2 transition ${color === c ? 'border-white' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              aria-label={`colorway ${c}`}
            />
          ))}
        </div>

        <button
          onClick={() => { found(name, emblemId, color); audio.stinger() }}
          className="w-full rounded border border-[var(--accent)] bg-[var(--accent)]/10 py-2.5 text-sm font-semibold tracking-widest text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
        >
          COMMISSION AGENCY
        </button>
      </div>
    </div>
  )
}
