'use client'

/**
 * StoryTrigger — invisible component that fires /api/story after each contract
 * completion. Watches lastCompletion from contractStore; debouncing is handled
 * inside triggerStory so rapid completions don't spam the route.
 */

import { useEffect } from 'react'
import { useContractStore } from '@/state/contractStore'
import { useWorldStore } from '@/state/worldStore'
import { triggerStory } from '@/lib/storyTrigger'

export default function StoryTrigger() {
  const lastCompletion = useContractStore((s) => s.lastCompletion)
  const events = useWorldStore((s) => s.events)

  useEffect(() => {
    if (!lastCompletion) return
    triggerStory(events)
  }, [lastCompletion, events])

  return null
}
