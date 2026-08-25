'use client'

import { useCallback } from 'react'
import { usePlaceStore } from '@/state/placeStore'

/**
 * PostcardStrip — shows the last up-to-3 postcards captured this session.
 * DataURLs are session-only (module-level via placeStore; not persisted).
 * Clicking a thumbnail re-downloads it. Hidden when no postcards exist.
 */
export default function PostcardStrip() {
  const postcards = usePlaceStore((s) => s.postcards)

  const handleDownload = useCallback((dataUrl: string, index: number) => {
    const link = document.createElement('a')
    link.download = `hyperion-postcard-${index + 1}.png`
    link.href = dataUrl
    link.click()
  }, [])

  if (postcards.length === 0) return null

  return (
    <div
      className="pointer-events-auto flex items-center gap-1.5"
      role="list"
      aria-label="Recent postcards"
    >
      {postcards.map((dataUrl, i) => (
        <button
          key={i}
          role="listitem"
          onClick={() => handleDownload(dataUrl, i)}
          title={`Re-download postcard ${i + 1}`}
          aria-label={`Re-download postcard ${i + 1}`}
          className="group relative h-8 w-12 overflow-hidden rounded border border-[var(--accent)]/40 bg-black/60 transition hover:border-[var(--accent)] hover:opacity-100 opacity-60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt={`Postcard ${i + 1}`}
            className="h-full w-full object-cover"
          />
          {/* Download overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/40">
            <span className="text-[8px] text-white opacity-0 transition group-hover:opacity-100 tracking-wider">
              ↓
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
