'use client'

import { useState, useEffect } from 'react'
import { loadJSON, saveJSON } from '@/lib/persist'
import { useAgencyStore } from '@/state/agencyStore'
import { audio } from '@/audio/AudioEngine'

const PERSIST_KEY = 'hyperion-onboarded-v1'

interface OnboardedState {
  done: boolean
}

type Step = {
  id: string
  /** Approximate position class for the callout box */
  position: string
  /** Which direction the pointer arrow faces */
  arrow: 'right' | 'bottom' | 'left'
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    id: 'fleet',
    position: 'top-36 right-[22rem]',
    arrow: 'right',
    title: 'Your fleet',
    body: 'This is your fleet — click a satellite to select it and reveal the burn planner.',
  },
  {
    id: 'burn',
    position: 'top-64 right-[22rem]',
    arrow: 'right',
    title: 'Plan a burn',
    body: 'Plan a burn here — drag Δv sliders until the intercept readout turns green.',
  },
  {
    id: 'contracts',
    position: 'top-[26rem] right-[22rem]',
    arrow: 'right',
    title: 'Contracts',
    body: 'Contracts appear here — accept one to get a target and unlock funding.',
  },
  {
    id: 'fly',
    position: 'bottom-24 left-1/2 -translate-x-1/2',
    arrow: 'bottom',
    title: 'Fly the burn',
    body: 'SPACE throttle · A / D trim · ESC abort — hold SPACE through the burn window.',
  },
]

function Arrow({ dir }: { dir: Step['arrow'] }) {
  /* A small chevron pointing toward the target panel */
  if (dir === 'right') {
    return (
      <div className="absolute right-[-10px] top-1/2 -translate-y-1/2">
        <svg width="10" height="16" viewBox="0 0 10 16">
          <path d="M0 0 L10 8 L0 16 Z" fill="var(--accent)" opacity="0.7" />
        </svg>
      </div>
    )
  }
  if (dir === 'left') {
    return (
      <div className="absolute left-[-10px] top-1/2 -translate-y-1/2">
        <svg width="10" height="16" viewBox="0 0 10 16">
          <path d="M10 0 L0 8 L10 16 Z" fill="var(--accent)" opacity="0.7" />
        </svg>
      </div>
    )
  }
  /* bottom */
  return (
    <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2">
      <svg width="16" height="10" viewBox="0 0 16 10">
        <path d="M0 0 L8 10 L16 0 Z" fill="var(--accent)" opacity="0.7" />
      </svg>
    </div>
  )
}

export default function Walkthrough() {
  const founded = useAgencyStore((s) => s.founded)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [step, setStep] = useState(0)

  /* Load persisted flag after mount (SSR-safe) */
  useEffect(() => {
    const saved = loadJSON<OnboardedState>(PERSIST_KEY, { done: false })
    setOnboarded(saved.done)
  }, [])

  function finish() {
    saveJSON(PERSIST_KEY, { done: true })
    setOnboarded(true)
  }

  function handleNext() {
    audio.uiTick()
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      finish()
    }
  }

  function handleSkip() {
    audio.uiTick()
    finish()
  }

  /* Not ready, not founded, or already onboarded */
  if (!founded || onboarded === null || onboarded === true) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    /* Dim overlay — pointer-events none everywhere except the callout */
    <div
      className="pointer-events-none fixed inset-0 z-50 font-mono"
      role="dialog"
      aria-modal="false"
      aria-label="guided walkthrough"
      data-testid="walkthrough"
    >
      {/* Subtle vignette to draw attention to the callout */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Callout card */}
      <div
        className={`pointer-events-auto absolute ${current.position} w-64 rounded-lg border border-[var(--accent)]/40 bg-black/80 p-4 backdrop-blur`}
        style={{ position: 'fixed' } /* ensure correct stacking */}
      >
        <Arrow dir={current.arrow} />

        {/* Step counter */}
        <p className="mb-1 text-[9px] tracking-[0.4em] text-[var(--accent)] opacity-60">
          STEP {step + 1} / {STEPS.length}
        </p>

        <h3 className="mb-1 text-[11px] font-semibold tracking-[0.2em] text-[var(--accent)]">
          {current.title.toUpperCase()}
        </h3>
        <p className="mb-4 text-[11px] leading-relaxed text-[var(--text)] opacity-85">
          {current.body}
        </p>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleSkip}
            className="rounded border border-white/15 px-3 py-1 text-[10px] text-white/50 transition hover:border-white/40 hover:text-white/80"
            aria-label="skip walkthrough"
            data-testid="walkthrough-skip"
          >
            SKIP
          </button>
          <button
            onClick={handleNext}
            className="rounded border border-[var(--accent)] px-3 py-1 text-[10px] text-[var(--accent)] transition hover:bg-[var(--accent)]/15"
            aria-label={isLast ? 'finish walkthrough' : 'next step'}
            data-testid="walkthrough-next"
          >
            {isLast ? 'DONE' : 'NEXT →'}
          </button>
        </div>
      </div>
    </div>
  )
}
