'use client'

import { useEffect, useState } from 'react'
import { useAuth, useUser, SignInButton, SignOutButton } from '@clerk/nextjs'
import { audio } from '@/audio/AudioEngine'
import { usePersistStatus } from '@/lib/persistStatus'

/**
 * Settings overlay: audio mute + a bulletproof RESET.
 *
 * Reset clears every hyperion-* save key AND reloads in the same click, so the
 * running stores never get a chance to re-persist their (possibly broken) state
 * before the reload — the failure mode of clearing localStorage by hand.
 */
export default function SettingsPanel() {
  const [open, setOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [muted, setMuted] = useState(false)

  // Clerk auth state — degrades gracefully if Clerk is unavailable (isLoaded stays false).
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth()
  const { user } = useUser()

  // Persist status from the bridge (updates reactively; starts 'local' before first server call).
  const persistStatus = usePersistStatus((s) => s.status)

  // Reflect the persisted mute state once mounted (audio is client-only).
  useEffect(() => {
    setMuted(audio.isMuted())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setConfirmReset(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const toggleMute = () => {
    const next = !muted
    audio.setMuted(next)
    setMuted(next)
    if (!next) audio.uiTick()
  }

  const resetGame = () => {
    try {
      // Clear every HYPERION save key (fleet/agency/contracts/story/profile/onboarded/muted/…).
      const keys: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('hyperion-')) keys.push(k)
      }
      keys.forEach((k) => window.localStorage.removeItem(k))
    } catch {
      // Best-effort; reload will still re-hydrate from whatever remains.
    }
    // Reload immediately so no store can re-persist before the fresh boot.
    window.location.reload()
  }

  return (
    <>
      <button
        aria-label="Settings"
        onClick={() => { audio.uiTick(); setOpen((v) => !v) }}
        className="pointer-events-auto fixed bottom-[4.25rem] right-6 z-30 h-9 w-9 rounded-full border border-white/20 bg-black/60 font-mono text-sm text-[var(--accent)] backdrop-blur transition hover:border-[var(--accent)]"
      >
        ⚙
      </button>

      {open && (
        <div
          className="pointer-events-auto fixed inset-0 z-[55] flex items-center justify-center bg-black/70 backdrop-blur-sm font-mono"
          onClick={() => { setOpen(false); setConfirmReset(false) }}
        >
          <div
            className="w-[min(92vw,26rem)] rounded-lg border border-[var(--accent)]/25 bg-black/85 p-5 text-xs text-[var(--text)] shadow-[0_0_40px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[11px] tracking-[0.35em] text-[var(--accent)]">SETTINGS</h2>
              <button
                aria-label="Close settings"
                onClick={() => { setOpen(false); setConfirmReset(false) }}
                className="text-white/50 transition hover:text-white/90"
              >
                ✕
              </button>
            </div>

            {/* Audio */}
            <div className="mb-4">
              <p className="mb-1.5 text-[9px] tracking-[0.3em] text-white/40">AUDIO</p>
              <button
                onClick={toggleMute}
                className="w-full rounded border border-white/15 px-3 py-2 text-left transition hover:border-white/40"
              >
                {muted ? '🔇 SOUND MUTED · tap to enable' : '🔊 SOUND ON · tap to mute'}
              </button>
            </div>

            {/* Account */}
            {clerkLoaded && (
              <div className="mb-4">
                <p className="mb-1.5 text-[9px] tracking-[0.3em] text-white/40">ACCOUNT</p>
                {isSignedIn ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] text-white/60">
                        {user?.primaryEmailAddress?.emailAddress ?? user?.firstName ?? 'Signed in'}
                      </span>
                      <SignOutButton>
                        <button
                          onClick={() => audio.uiTick()}
                          className="shrink-0 rounded border border-white/15 px-2 py-1 text-[9px] text-white/50 transition hover:border-white/40 hover:text-white/90"
                        >
                          SIGN OUT
                        </button>
                      </SignOutButton>
                    </div>
                    {/* Save status line */}
                    {persistStatus === 'offline' ? (
                      <p className="text-[9px] text-amber-400/70">
                        ⚠ Offline — saving locally
                      </p>
                    ) : (
                      <p className="text-[9px] text-[var(--accent)]/60">
                        ✓ Saved to your account
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* Save status line */}
                    <p className="mb-2 text-[10px] leading-relaxed text-white/50">
                      {persistStatus === 'offline'
                        ? '⚠ Offline — saving locally'
                        : 'Saved on this device · sign in to sync across devices'}
                    </p>
                    <SignInButton mode="modal">
                      <button
                        onClick={() => audio.uiTick()}
                        className="w-full rounded border border-[var(--accent)]/40 px-3 py-2 text-[10px] text-[var(--accent)]/80 transition hover:border-[var(--accent)]/70 hover:text-[var(--accent)]"
                      >
                        SIGN IN · SYNC SAVES
                      </button>
                    </SignInButton>
                  </div>
                )}
              </div>
            )}

            {/* Reset */}
            <div className="mb-2">
              <p className="mb-1.5 text-[9px] tracking-[0.3em] text-white/40">SAVE DATA</p>
              <p className="mb-2 text-[10px] leading-relaxed text-white/50">
                Wipes your agency, fleet, contracts, story, and progress on this device and starts a fresh game.
                This can&apos;t be undone.
              </p>
              {confirmReset ? (
                <div className="flex gap-2">
                  <button
                    onClick={resetGame}
                    className="flex-1 rounded border border-red-500/70 bg-red-500/15 px-3 py-2 font-bold text-red-300 transition hover:bg-red-500/25"
                  >
                    CONFIRM RESET
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="rounded border border-white/15 px-3 py-2 text-white/60 transition hover:border-white/40 hover:text-white/90"
                  >
                    CANCEL
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { audio.uiTick(); setConfirmReset(true) }}
                  className="w-full rounded border border-red-500/40 px-3 py-2 text-red-400/80 transition hover:border-red-500/70 hover:text-red-300"
                >
                  RESET GAME
                </button>
              )}
            </div>

            <p className="mt-4 text-center text-[9px] text-white/30">
              Press <span className="text-white/50">?</span> any time for the field guide
            </p>
          </div>
        </div>
      )}
    </>
  )
}
