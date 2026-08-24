'use client'

import { useState, useEffect } from 'react'
import { useAgencyStore } from '@/state/agencyStore'
import { useWorldStore } from '@/state/worldStore'
import { useContractStore } from '@/state/contractStore'
import { buildColdOpen } from '@/lib/coldOpen'
import { getPriorLastSeen } from '@/lib/priorSession'

/**
 * ColdOpenScreen — "while you were away" situation-room recap.
 *
 * Shown once per page load to a returning, founded player.
 * Dismissed with one action: "ENTER OPERATIONS".
 * Renders nothing if the agency is not founded or this is the first session.
 */
export default function ColdOpenScreen() {
  const founded = useAgencyStore((s) => s.founded)
  const events = useWorldStore((s) => s.events)
  const contracts = useContractStore((s) => s.contracts)
  const [dismissed, setDismissed] = useState(false)

  // Build the summary once (stable across re-renders while events/contracts change
  // before dismissal). We delay until events are loaded so headlineEvents are real.
  const [summary, setSummary] = useState<ReturnType<typeof buildColdOpen> | null>(null)

  useEffect(() => {
    // Only compute once — if already computed, skip.
    if (summary !== null) return
    // Need a founded agency and at least some events loaded.
    if (!founded || events.length === 0) return

    const priorLastSeen = getPriorLastSeen()
    const built = buildColdOpen({
      lastSeenIso: priorLastSeen,
      nowWallMs: Date.now(),
      events,
      contracts,
    })
    setSummary(built)
  }, [founded, events, contracts, summary])

  // Not a returning player, or dismissed, or not yet computed.
  if (!founded) return null
  if (!summary) return null
  if (!summary.isReturning) return null
  if (dismissed) return null

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm font-mono text-[var(--text)]">
      <div className="w-[540px] max-w-[92vw] rounded-lg border border-[var(--accent)]/40 bg-black/80 p-6">
        {/* Header */}
        <p className="text-[10px] tracking-[0.5em] text-[var(--accent)] opacity-70">HYPERION</p>
        <h1 className="mt-0.5 mb-1 text-sm font-semibold tracking-[0.35em] text-[var(--accent)]">
          SITUATION UPDATE
        </h1>
        <span className="mb-4 block h-px w-full bg-[var(--accent)]/20" />

        {/* Bullet lines */}
        <ul className="mb-5 space-y-2 text-xs leading-relaxed">
          {summary.lines.map((line, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] opacity-80" />
              <span className={i === 0 ? 'font-semibold tracking-wide' : 'opacity-85'}>{line}</span>
            </li>
          ))}
        </ul>

        {/* Headline events */}
        {summary.headlineEvents.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-[10px] tracking-[0.35em] opacity-50">SIGNIFICANT EVENTS</p>
            <ul className="space-y-1">
              {summary.headlineEvents.map((title, i) => (
                <li
                  key={i}
                  className="rounded border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-[var(--text)] opacity-90"
                >
                  {title}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Dismiss */}
        <button
          onClick={() => setDismissed(true)}
          className="w-full rounded border border-[var(--accent)] bg-[var(--accent)]/10 py-2.5 text-xs font-semibold tracking-widest text-[var(--accent)] transition hover:bg-[var(--accent)]/20 active:scale-[0.98]"
        >
          ENTER OPERATIONS
        </button>
      </div>
    </div>
  )
}
