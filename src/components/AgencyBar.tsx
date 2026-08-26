'use client'

import { useAgencyStore } from '@/state/agencyStore'
import { useGameStore } from '@/state/gameStore'
import { Emblem } from '@/components/Emblem'
import { agencyTitle } from '@/state/agencyStore'

export default function AgencyBar() {
  const founded = useAgencyStore((s) => s.founded)
  const name = useAgencyStore((s) => s.name)
  const emblemId = useAgencyStore((s) => s.emblemId)
  const color = useAgencyStore((s) => s.colorway)
  const funding = useAgencyStore((s) => s.funding)
  const reputation = useAgencyStore((s) => s.reputation)
  const fleet = useGameStore((s) => s.satellites.length)
  const refitTokens = useAgencyStore((s) => s.milestones.refitTokens)
  const reliefGrantsClaimed = useAgencyStore((s) => s.milestones.reliefGrantsClaimed)

  if (!founded) return null

  return (
    <div className="pointer-events-auto fixed left-1/2 top-4 z-20 -translate-x-1/2 font-mono text-xs text-[var(--text)]">
      <div className="flex items-center gap-4 rounded-full border border-white/10 bg-black/60 px-4 py-1.5 backdrop-blur">
        <span className="flex items-center gap-2">
          <Emblem id={emblemId} color={color} size={22} />
          <span className="font-semibold tracking-wide">{name}</span>
        </span>
        <span className="h-4 w-px bg-white/15" />
        <span className="tabular-nums" style={{ color }}>§{funding.toLocaleString()}</span>
        <span className="tabular-nums opacity-80">REP {reputation} · {agencyTitle()}</span>
        <span className="tabular-nums opacity-60">FLEET {fleet}</span>
        {reliefGrantsClaimed > 0 && (
          <>
            <span className="h-4 w-px bg-white/15" />
            <span className="tabular-nums opacity-60" title={`${reliefGrantsClaimed} relief grants earned`}>
              ★ {reliefGrantsClaimed}g
            </span>
          </>
        )}
        {refitTokens > 0 && (
          <span
            className="tabular-nums font-semibold"
            style={{ color: '#f97316' }}
            title={`${refitTokens} emergency-refit token${refitTokens !== 1 ? 's' : ''} available`}
          >
            ⛽ {refitTokens}
          </span>
        )}
      </div>
    </div>
  )
}
