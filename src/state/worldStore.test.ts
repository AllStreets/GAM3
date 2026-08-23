import { describe, it, expect, beforeEach } from 'vitest'
import { useWorldStore } from './worldStore'
import type { WorldEvent } from '@/lib/worldEvents'

const ev = (id: string): WorldEvent => ({
  id, kind: 'quake', title: `Event ${id}`, lat: 0, lon: 0,
  time: '2026-08-23T00:00:00Z', severity: 0.5,
})

beforeEach(() => {
  useWorldStore.getState().resetForTest()
})

describe('worldStore', () => {
  it('stores events and metadata', () => {
    useWorldStore.getState().setEvents([ev('a'), ev('b')], true, '2026-08-23T01:00:00Z')
    const s = useWorldStore.getState()
    expect(s.events).toHaveLength(2)
    expect(s.sourcesOk).toBe(true)
    expect(s.lastFetch).toBe('2026-08-23T01:00:00Z')
  })

  it('never blanks a non-empty world with an empty fetch', () => {
    useWorldStore.getState().setEvents([ev('a')], true, 't1')
    useWorldStore.getState().setEvents([], false, 't2')
    const s = useWorldStore.getState()
    expect(s.events).toHaveLength(1)
    expect(s.sourcesOk).toBe(false)
  })

  it('clears focus when the focused event disappears', () => {
    useWorldStore.getState().setEvents([ev('a')], true, 't1')
    useWorldStore.getState().focusEvent('a')
    useWorldStore.getState().setEvents([ev('b')], true, 't2')
    expect(useWorldStore.getState().focusedId).toBeNull()
  })

  it('focusEvent toggles and clears', () => {
    useWorldStore.getState().setEvents([ev('a')], true, 't1')
    useWorldStore.getState().focusEvent('a')
    expect(useWorldStore.getState().focusedId).toBe('a')
    useWorldStore.getState().focusEvent(null)
    expect(useWorldStore.getState().focusedId).toBeNull()
  })
})
