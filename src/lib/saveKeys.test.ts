import { describe, it, expect } from 'vitest'
import { isStoreKey, STORE_KEYS } from './db'

describe('isStoreKey allowlist', () => {
  it('accepts all 6 known store keys', () => {
    for (const key of STORE_KEYS) {
      expect(isStoreKey(key)).toBe(true)
    }
  })

  it('rejects arbitrary strings', () => {
    expect(isStoreKey('hyperion-unknown-v1')).toBe(false)
    expect(isStoreKey('fleet')).toBe(false)
    expect(isStoreKey('')).toBe(false)
    expect(isStoreKey('hyperion-fleet-v2')).toBe(false)
    expect(isStoreKey('HYPERION-FLEET-V1')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isStoreKey(null)).toBe(false)
    expect(isStoreKey(undefined)).toBe(false)
    expect(isStoreKey(42)).toBe(false)
    expect(isStoreKey({})).toBe(false)
    expect(isStoreKey([])).toBe(false)
  })
})
