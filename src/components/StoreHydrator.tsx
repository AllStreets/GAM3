'use client'
import { useEffect, useState } from 'react'
import { useAgencyStore } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { useGameStore } from '@/state/gameStore'

/** Hydrates persisted stores after mount so SSR and first client render match (no hydration error). */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    useAgencyStore.getState().hydrate()
    useContractStore.getState().hydrate()
    useGameStore.getState().hydrate()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true)
  }, [])
  return hydrated
}
