/**
 * Chip — tiny presentational badge used across FleetPanel, ContractsPanel,
 * SatelliteRecordCard, and CompletionCinematic. Shared so chrome vocabulary
 * stays consistent (rounded, tiny uppercase, subtle border + bg, optional
 * accent colour override).
 */
import React from 'react'

interface ChipProps {
  children: React.ReactNode
  /** Optional explicit colour (hex/CSS). Defaults to inherit (text/border use var(--text)). */
  color?: string
  /** Extra className for one-off tweaks (e.g. opacity). */
  className?: string
}

export function Chip({ children, color, className = '' }: ChipProps) {
  const style = color
    ? {
        color,
        borderColor: `${color}50`,
        background: `${color}12`,
      }
    : undefined

  return (
    <span
      className={`inline-flex items-center rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] font-bold tracking-widest ${className}`}
      style={style}
    >
      {children}
    </span>
  )
}
