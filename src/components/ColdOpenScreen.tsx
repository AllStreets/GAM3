'use client'

import { useState, useEffect, useRef } from 'react'
import { useAgencyStore } from '@/state/agencyStore'
import { useWorldStore } from '@/state/worldStore'
import { useContractStore } from '@/state/contractStore'
import { buildColdOpen, digestLines } from '@/lib/coldOpen'
import { getPriorLastSeen } from '@/lib/priorSession'
import { useWorldDigest, clearDigest } from '@/lib/worldDigest'
import { getAnonId } from '@/lib/anonId'

const WORLD_DIGEST_KEY = 'hyperion-worlddigest-v1'

/** Fire-and-forget: POST an empty digest to the server so it doesn't resurface on next load. */
function serverClearDigest(): void {
  const anonId = getAnonId()
  if (!anonId) return
  fetch('/api/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-anon-id': anonId,
    },
    body: JSON.stringify({ key: WORLD_DIGEST_KEY, data: {} }),
  }).catch(() => {
    // Network failure — silently ignore; digest cleared in memory already.
  })
}

/**
 * ColdOpenScreen — "while you were away" situation-room recap.
 *
 * Shown once per page load to a returning, founded player.
 * Dismissed with one action: "ENTER OPERATIONS".
 * Renders nothing if the agency is not founded or this is the first session.
 *
 * When a server WorldDigest is present (written by the away-tick), it is
 * appended to the standard recap under a "WHILE YOU WERE AWAY" digest section.
 * On dismiss, the digest is consumed + cleared so it shows exactly once.
 *
 * Show-once guard: we track the digest's atSim on dismiss so a stale in-memory
 * digest (e.g. React StrictMode double-mount) can't re-show the same tick.
 */
export default function ColdOpenScreen() {
  const founded = useAgencyStore((s) => s.founded)
  const events = useWorldStore((s) => s.events)
  const contracts = useContractStore((s) => s.contracts)
  const digest = useWorldDigest((s) => s.digest)
  const [dismissed, setDismissed] = useState(false)

  // Build the summary once (stable across re-renders while events/contracts change
  // before dismissal). We delay until events are loaded so headlineEvents are real.
  const [summary, setSummary] = useState<ReturnType<typeof buildColdOpen> | null>(null)

  // Show-once guard: track the atSim values we have already consumed this session.
  const consumedAtSimRef = useRef<Set<number>>(new Set())

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

  // Determine whether we have a meaningful digest to show.
  // Guard: only show a given atSim once per session (double-mount protection).
  const digestContent = (() => {
    if (!digest) return null
    if (consumedAtSimRef.current.has(digest.atSim)) return null
    const lines = digestLines(digest)
    if (lines.length === 0) return null
    return { lines, atSim: digest.atSim }
  })()

  // Decide if the screen should show at all.
  // Show when: founded + (returning with events recap OR server digest present).
  const hasStandardRecap = summary !== null && summary.isReturning
  const hasDigestSection = digestContent !== null

  // Not a returning player, or dismissed, or not yet computed.
  if (!founded) return null
  if (!hasStandardRecap && !hasDigestSection) return null
  if (dismissed) return null

  const handleDismiss = () => {
    // Consume + clear the digest so it doesn't resurface.
    if (digest) {
      consumedAtSimRef.current.add(digest.atSim)
      clearDigest()          // clear in-memory zustand store
      serverClearDigest()    // clear server blob (fire-and-forget)
    }
    setDismissed(true)
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm font-mono text-[var(--text)]">
      <div className="w-[540px] max-w-[92vw] rounded-lg border border-[var(--accent)]/40 bg-black/80 p-6">
        {/* Header */}
        <p className="text-[10px] tracking-[0.5em] text-[var(--accent)] opacity-70">HYPERION</p>
        <h1 className="mt-0.5 mb-1 text-sm font-semibold tracking-[0.35em] text-[var(--accent)]">
          SITUATION UPDATE
        </h1>
        <span className="mb-4 block h-px w-full bg-[var(--accent)]/20" />

        {/* Standard recap bullet lines */}
        {hasStandardRecap && summary && (
          <ul className="mb-5 space-y-2 text-xs leading-relaxed">
            {summary.lines.map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] opacity-80" />
                <span className={i === 0 ? 'font-semibold tracking-wide' : 'opacity-85'}>{line}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Headline events */}
        {hasStandardRecap && summary && summary.headlineEvents.length > 0 && (
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

        {/* Server digest section — "while you were away" from the tick */}
        {hasDigestSection && digestContent && (
          <div className={hasStandardRecap && summary && summary.lines.length > 0 ? 'mb-5 border-t border-[var(--accent)]/15 pt-4' : 'mb-5'}>
            <p className="mb-2 text-[10px] tracking-[0.35em] opacity-50">WHILE YOU WERE AWAY</p>
            <ul className="space-y-2">
              {digestContent.lines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]/60 opacity-80" />
                  <span className="opacity-85">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="w-full rounded border border-[var(--accent)] bg-[var(--accent)]/10 py-2.5 text-xs font-semibold tracking-widest text-[var(--accent)] transition hover:bg-[var(--accent)]/20 active:scale-[0.98]"
        >
          ENTER OPERATIONS
        </button>
      </div>
    </div>
  )
}
