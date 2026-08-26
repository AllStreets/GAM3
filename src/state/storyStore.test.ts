import { describe, it, expect, beforeEach } from 'vitest'
import { useStoryStore, type Dispatch } from './storyStore'
import { saveJSON } from '@/lib/persist'

beforeEach(() => useStoryStore.getState().resetForTest())

const makeDispatch = (id: string, at = 1000): Dispatch => ({
  id,
  at,
  text: `Dispatch ${id}`,
  source: 'story',
})

describe('storyStore', () => {
  it('starts with empty arcs, dispatches, lastStoryAt 0', () => {
    const s = useStoryStore.getState()
    expect(s.arcs).toEqual([])
    expect(s.dispatches).toEqual([])
    expect(s.lastStoryAt).toBe(0)
  })

  it('addDispatch prepends and updates lastStoryAt', () => {
    useStoryStore.getState().addDispatch(makeDispatch('a', 500))
    useStoryStore.getState().addDispatch(makeDispatch('b', 1000))
    const s = useStoryStore.getState()
    expect(s.dispatches[0].id).toBe('b')
    expect(s.dispatches[1].id).toBe('a')
    expect(s.lastStoryAt).toBe(1000)
  })

  it('addDispatch caps at 20 dispatches', () => {
    for (let i = 0; i < 25; i++) {
      useStoryStore.getState().addDispatch(makeDispatch(`d${i}`, i * 10))
    }
    expect(useStoryStore.getState().dispatches.length).toBe(20)
  })

  it('upsertArc inserts a new arc', () => {
    useStoryStore.getState().upsertArc({ id: 'main', theme: 'Emergence', tension: 0.3, beatsSeen: 1 })
    expect(useStoryStore.getState().arcs).toHaveLength(1)
    expect(useStoryStore.getState().arcs[0].theme).toBe('Emergence')
  })

  it('upsertArc replaces an existing arc by id', () => {
    useStoryStore.getState().upsertArc({ id: 'main', theme: 'Emergence', tension: 0.3, beatsSeen: 1 })
    useStoryStore.getState().upsertArc({ id: 'main', theme: 'Crisis Response', tension: 0.5, beatsSeen: 2 })
    const s = useStoryStore.getState()
    expect(s.arcs).toHaveLength(1)
    expect(s.arcs[0].theme).toBe('Crisis Response')
  })

  it('hydrate with missing fields falls back to defaults (back-compat)', () => {
    // Simulate an old save missing the arcs field
    saveJSON('hyperion-story-v1', { dispatches: [], lastStoryAt: 0 })
    useStoryStore.getState().hydrate()
    expect(useStoryStore.getState().arcs).toEqual([])
  })

  it('hydrate restores persisted dispatches', () => {
    const d = makeDispatch('x', 999)
    saveJSON('hyperion-story-v1', { arcs: [], dispatches: [d], lastStoryAt: 999 })
    useStoryStore.getState().hydrate()
    const s = useStoryStore.getState()
    expect(s.dispatches[0].id).toBe('x')
    expect(s.lastStoryAt).toBe(999)
  })
})
