'use client'

import { useEffect, useState } from 'react'
import { audio } from '@/audio/AudioEngine'

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-white/25 bg-white/5 px-1.5 py-0.5 text-[10px]">{children}</kbd>
}

export default function GuidePanel() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' || e.key === 'h' || e.key === 'H') { setOpen((o) => !o); audio.uiTick() }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        onClick={() => { setOpen((o) => !o); audio.uiTick() }}
        className="pointer-events-auto fixed bottom-6 right-6 z-30 h-9 w-9 rounded-full border border-white/20 bg-black/60 font-mono text-sm text-[var(--accent)] backdrop-blur transition hover:border-[var(--accent)]"
        aria-label="guide"
      >
        ?
      </button>

      {open && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm font-mono text-xs text-[var(--text)]" onClick={() => setOpen(false)}>
          <div className="w-[620px] max-w-[92vw] rounded-lg border border-white/10 bg-black/80 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[10px] tracking-[0.4em] text-[var(--accent)]">FIELD GUIDE</h2>
              <button onClick={() => setOpen(false)} className="opacity-60 hover:opacity-100">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <section>
                <p className="mb-2 font-semibold text-[var(--accent)]">Command your fleet</p>
                <svg viewBox="0 0 120 60" className="mb-2 w-full">
                  <circle cx="30" cy="40" r="18" fill="none" stroke="#45d8ff" strokeWidth="1" opacity="0.4" />
                  <path d="M14 44 l10 -3 l-2 4 z" fill="#45d8ff" />
                  <circle cx="86" cy="20" r="3" fill="#45d8ff" />
                  <text x="72" y="42" fill="#e6edf3" fontSize="7">click a bird</text>
                </svg>
                <p className="opacity-75">Click a satellite (or a fleet-panel entry) to <b>select</b> it.</p>
              </section>

              <section>
                <p className="mb-2 font-semibold text-[var(--accent)]">Plan a burn</p>
                <svg viewBox="0 0 120 60" className="mb-2 w-full">
                  <ellipse cx="60" cy="30" rx="40" ry="16" fill="none" stroke="#45d8ff" strokeWidth="1" opacity="0.5" />
                  <ellipse cx="60" cy="30" rx="52" ry="22" fill="none" stroke="#ffb86b" strokeWidth="1" strokeDasharray="3 3" />
                  <text x="30" y="56" fill="#ffb86b" fontSize="7">ghost orbit = preview</text>
                </svg>
                <p className="opacity-75">Drag <b>PROGRADE / NORMAL / RADIAL</b> Δv. The amber ghost shows your new orbit; the intercept readout turns green when you'll pass the target.</p>
              </section>

              <section>
                <p className="mb-2 font-semibold text-[var(--accent)]">Fly the burn</p>
                <p className="mb-1 flex gap-2"><Key>SPACE</Key><span className="opacity-75">hold to throttle</span></p>
                <p className="mb-1 flex gap-2"><Key>A</Key><Key>D</Key><span className="opacity-75">trim the needle</span></p>
                <p className="flex gap-2"><Key>ESC</Key><span className="opacity-75">abort</span></p>
              </section>

              <section>
                <p className="mb-2 font-semibold text-[var(--accent)]">Run contracts</p>
                <p className="opacity-75">Accept a contract, maneuver a satellite over its <span style={{ color: '#ffb86b' }}>ringed target</span>, and the pass completes it — earning <b>§ funding</b> and <b>reputation</b>. Spend funding to <b>refuel</b> or <b>buy satellites</b>.</p>
                <p className="mt-2 opacity-50">Toggle this guide any time with <Key>?</Key></p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
