'use client'

import { useEffect, useState } from 'react'
import { audio } from '@/audio/AudioEngine'

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-1.5 py-0.5 text-[10px] font-mono text-[var(--accent)]">
      {children}
    </kbd>
  )
}

/** Diagram A — Three Δv sliders feeding an amber ghost ellipse */
function BurnDiagram() {
  return (
    <figure>
      <svg viewBox="0 0 160 90" className="mb-2 w-full" aria-hidden="true">
        {/* Current orbit */}
        <ellipse cx="80" cy="55" rx="55" ry="22" fill="none" stroke="#45d8ff" strokeWidth="1.2" opacity="0.5" />

        {/* Ghost / preview orbit (amber dashed) */}
        <ellipse cx="80" cy="48" rx="68" ry="30" fill="none" stroke="#ffb86b" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.85" />

        {/* Satellite dot */}
        <circle cx="135" cy="55" r="3" fill="#45d8ff" />

        {/* Δv vector arrow */}
        <line x1="135" y1="55" x2="148" y2="42" stroke="#ffb86b" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0 0 L6 3 L0 6 Z" fill="#ffb86b" />
          </marker>
        </defs>

        {/* Sliders (stylised) */}
        {[
          { y: 12, label: 'PRO', pct: 0.55 },
          { y: 22, label: 'NRM', pct: 0.72 },
          { y: 32, label: 'RAD', pct: 0.30 },
        ].map(({ y, label, pct }) => (
          <g key={label}>
            <text x="2" y={y + 4} fill="#e6edf3" fontSize="6" opacity="0.6">{label}</text>
            <rect x="20" y={y} width="60" height="4" rx="2" fill="#ffffff" opacity="0.08" />
            <rect x="20" y={y} width={60 * pct} height="4" rx="2" fill="#45d8ff" opacity="0.6" />
            <circle cx={20 + 60 * pct} cy={y + 2} r="3" fill="#45d8ff" />
          </g>
        ))}

        {/* Labels */}
        <text x="2" y="84" fill="#ffb86b" fontSize="6" opacity="0.85">ghost = preview orbit</text>
        <text x="2" y="75" fill="#45d8ff" fontSize="6" opacity="0.7">current orbit</text>
      </svg>
      <figcaption className="text-[10px] leading-relaxed opacity-70">
        Drag <b>PROGRADE / NORMAL / RADIAL</b> Δv. The amber ghost shows your new orbit.
      </figcaption>
    </figure>
  )
}

/** Diagram B — Intercept readout turning green */
function InterceptDiagram() {
  return (
    <figure>
      <svg viewBox="0 0 160 60" className="mb-2 w-full" aria-hidden="true">
        {/* Readout box — red state */}
        <rect x="4" y="8" width="68" height="44" rx="4" fill="#ff4444" opacity="0.12" stroke="#ff4444" strokeWidth="0.8" />
        <text x="12" y="24" fill="#ff6666" fontSize="7">CLOSEST</text>
        <text x="12" y="36" fill="#ff6666" fontSize="10" fontWeight="bold">4 820 km</text>
        <text x="12" y="46" fill="#ff6666" fontSize="6" opacity="0.7">not aligned</text>

        {/* Arrow right */}
        <path d="M78 30 L86 30 M82 26 L86 30 L82 34" stroke="#e6edf3" strokeWidth="1" fill="none" opacity="0.5" />

        {/* Readout box — green state */}
        <rect x="90" y="8" width="66" height="44" rx="4" fill="#00cc66" opacity="0.12" stroke="#00cc66" strokeWidth="0.8" />
        <text x="98" y="24" fill="#00e676" fontSize="7">CLOSEST</text>
        <text x="98" y="36" fill="#00e676" fontSize="10" fontWeight="bold">38 km</text>
        <text x="98" y="46" fill="#00e676" fontSize="6" opacity="0.85">✓ on track</text>
      </svg>
      <figcaption className="text-[10px] leading-relaxed opacity-70">
        The intercept readout turns <span className="text-emerald-400">green</span> when you&apos;ll pass within range — then IGNITE.
      </figcaption>
    </figure>
  )
}

/** Diagram C — Flying key legend */
function FlyDiagram() {
  return (
    <figure>
      <svg viewBox="0 0 160 70" className="mb-2 w-full" aria-hidden="true">
        {/* Throttle bar */}
        <rect x="4" y="8" width="60" height="8" rx="2" fill="#ffffff" opacity="0.06" />
        <rect x="4" y="8" width="38" height="8" rx="2" fill="#45d8ff" opacity="0.5" />
        <text x="68" y="16" fill="#45d8ff" fontSize="6">throttle</text>

        {/* SPACE key */}
        <rect x="4" y="22" width="56" height="11" rx="2" fill="none" stroke="#45d8ff" strokeWidth="0.8" opacity="0.7" />
        <text x="20" y="31" fill="#45d8ff" fontSize="7">SPACE</text>

        {/* A D keys */}
        <rect x="4" y="40" width="14" height="14" rx="2" fill="none" stroke="#45d8ff" strokeWidth="0.8" opacity="0.7" />
        <text x="9" y="51" fill="#45d8ff" fontSize="8">A</text>
        <rect x="22" y="40" width="14" height="14" rx="2" fill="none" stroke="#45d8ff" strokeWidth="0.8" opacity="0.7" />
        <text x="27" y="51" fill="#45d8ff" fontSize="8">D</text>
        <text x="42" y="51" fill="#e6edf3" fontSize="6" opacity="0.65">trim needle</text>

        {/* ESC key */}
        <rect x="4" y="60" width="22" height="9" rx="2" fill="none" stroke="#ff6666" strokeWidth="0.8" opacity="0.6" />
        <text x="7" y="67" fill="#ff6666" fontSize="6">ESC</text>
        <text x="30" y="67" fill="#e6edf3" fontSize="6" opacity="0.65">abort</text>

        {/* Needle indicator */}
        <line x1="120" y1="10" x2="120" y2="60" stroke="#ffffff" strokeWidth="0.5" opacity="0.2" />
        <line x1="120" y1="35" x2="140" y2="35" stroke="#ffb86b" strokeWidth="2" />
        <circle cx="140" cy="35" r="3" fill="#ffb86b" />
        <text x="108" y="28" fill="#e6edf3" fontSize="5" opacity="0.5">needle</text>
      </svg>
      <figcaption className="text-[10px] leading-relaxed opacity-70">
        Hold <Key>SPACE</Key> to throttle · <Key>A</Key>/<Key>D</Key> trim · <Key>ESC</Key> abort
      </figcaption>
    </figure>
  )
}

export default function GuidePanel() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' || e.key === 'h' || e.key === 'H') {
        const el = document.activeElement
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
        setOpen((o) => !o); audio.uiTick()
      }
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
        data-testid="guide-button"
      >
        ?
      </button>

      {open && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm font-mono text-xs text-[var(--text)]"
          onClick={() => setOpen(false)}
          data-testid="guide-panel"
        >
          <div
            className="w-[660px] max-w-[94vw] rounded-lg border border-white/10 bg-black/85 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[10px] tracking-[0.4em] text-[var(--accent)]">FIELD GUIDE</h2>
              <button
                onClick={() => setOpen(false)}
                className="opacity-60 hover:opacity-100"
                aria-label="close guide"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <section>
                <p className="mb-2 text-[10px] font-semibold tracking-[0.25em] text-[var(--accent)]">SELECT A SATELLITE</p>
                <svg viewBox="0 0 160 70" className="mb-2 w-full" aria-hidden="true">
                  {/* Earth */}
                  <circle cx="40" cy="50" r="22" fill="none" stroke="#45d8ff" strokeWidth="1" opacity="0.35" />
                  {/* Orbit ring */}
                  <ellipse cx="40" cy="50" rx="40" ry="16" fill="none" stroke="#45d8ff" strokeWidth="0.8" opacity="0.3" />
                  {/* Satellite */}
                  <circle cx="80" cy="50" r="3.5" fill="#45d8ff" opacity="0.9" />
                  {/* Click cursor */}
                  <path d="M95 42 L91 55 L94 53 L97 58 L99 57 L96 52 L100 51 Z" fill="#e6edf3" opacity="0.8" />
                  {/* Fleet panel stub */}
                  <rect x="110" y="18" width="46" height="50" rx="3" fill="none" stroke="#45d8ff" strokeWidth="0.6" opacity="0.35" />
                  <text x="114" y="29" fill="#45d8ff" fontSize="5" opacity="0.7">FLEET</text>
                  <rect x="114" y="33" width="38" height="10" rx="2" fill="#45d8ff" opacity="0.2" />
                  <text x="116" y="41" fill="#e6edf3" fontSize="5" opacity="0.8">HYPERION-1</text>
                  <rect x="114" y="46" width="38" height="10" rx="2" fill="none" stroke="#ffffff" strokeWidth="0.4" opacity="0.3" />
                  <text x="116" y="54" fill="#e6edf3" fontSize="5" opacity="0.5">HYPERION-2</text>
                  <text x="114" y="65" fill="#e6edf3" fontSize="5" opacity="0.4">click to select</text>
                </svg>
                <p className="text-[10px] leading-relaxed opacity-70">
                  Click a satellite on the globe or its <b>fleet-panel entry</b> to select it.
                </p>
              </section>

              <section>
                <p className="mb-2 text-[10px] font-semibold tracking-[0.25em] text-[var(--accent)]">PLAN A BURN</p>
                <BurnDiagram />
              </section>

              <section>
                <p className="mb-2 text-[10px] font-semibold tracking-[0.25em] text-[var(--accent)]">FLY THE BURN</p>
                <FlyDiagram />
              </section>

              <section>
                <p className="mb-2 text-[10px] font-semibold tracking-[0.25em] text-[var(--accent)]">INTERCEPT READOUT</p>
                <InterceptDiagram />
                <div className="mt-3 border-t border-white/10 pt-3">
                  <p className="text-[10px] leading-relaxed opacity-70">
                    Accept a contract, maneuver over its <span className="text-amber-400">ringed target</span>, and the pass earns{' '}
                    <b>§ funding</b> + <b>reputation</b>. Spend funding to refuel or buy satellites.
                  </p>
                  <p className="mt-2 text-[10px] opacity-40">
                    Press <Key>?</Key> any time to toggle this guide.
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
