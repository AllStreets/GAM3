'use client'

import { useEffect, useState } from 'react'
import FleetPanel from '@/components/FleetPanel'
import EventsPanel from '@/components/EventsPanel'
import BurnOverlay, { BurnGradeReadout } from '@/components/BurnOverlay'
import BriefingPanel from '@/components/BriefingPanel'
import FoundingScreen from '@/components/FoundingScreen'
import AgencyBar from '@/components/AgencyBar'
import ContractsPanel from '@/components/ContractsPanel'
import InterceptReadout from '@/components/InterceptReadout'
import GuidePanel from '@/components/GuidePanel'
import GuidanceHint from '@/components/GuidanceHint'
import Walkthrough from '@/components/Walkthrough'
import CompletionCinematic from '@/components/CompletionCinematic'
import { ConjunctionAlert, LossBeat } from '@/components/EmergencyAlert'
import ColdOpenScreen from '@/components/ColdOpenScreen'
import PostcardButton from '@/components/PostcardButton'
import PostcardStrip from '@/components/PostcardStrip'
import PlaceCard from '@/components/PlaceCard'
import CityRevealOverlay from '@/components/CityRevealOverlay'

function utcNow(): string {
  return new Date().toISOString().slice(11, 19) + ' UTC'
}

export default function Hud() {
  const [clock, setClock] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <div className="pointer-events-none fixed right-6 top-16 z-20 flex max-h-[calc(100dvh-6rem)] w-80 flex-col gap-3 overflow-y-auto">
        <FleetPanel />
        <ContractsPanel />
      </div>
      <EventsPanel />
      <BurnOverlay />
      <BurnGradeReadout />
      <BriefingPanel />
      <AgencyBar />
      <GuidanceHint />
      <InterceptReadout />
      <GuidePanel />
      <Walkthrough />
      <FoundingScreen />
      <ColdOpenScreen />
      <CompletionCinematic />
      <ConjunctionAlert />
      <LossBeat />
      <PlaceCard />
      <CityRevealOverlay />
      {/* Postcard controls — bottom-right, shifted left of the round GUIDE (?) button so they never overlap */}
      <div className="pointer-events-none fixed bottom-6 right-20 z-20 flex flex-col items-end gap-2">
        <PostcardStrip />
        <PostcardButton />
      </div>
    </div>
  )
}
