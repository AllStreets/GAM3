'use client'
import { useEffect, useState } from 'react'
import { useAgencyStore } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { useGameStore } from '@/state/gameStore'
import { PersistBridge } from '@/components/PersistBridge'

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

/** Mount this alongside useHydrated() to wire up the server persistence bridge. */
export { PersistBridge }
