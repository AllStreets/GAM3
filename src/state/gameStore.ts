import { create } from 'zustand'
import {
  applyDeltaV, MS_TO_ER, type OrbitalElements,
} from '@/lib/orbits'

export interface Satellite {
  id: string
  name: string
  elements: OrbitalElements
  /** Remaining delta-v budget, m/s. */
  fuel: number
  fuelCapacity: number
}

export interface BurnPlan {
  prograde: number // m/s
  normal: number
  radial: number
}

const ZERO_PLAN: BurnPlan = { prograde: 0, normal: 0, radial: 0 }

const deg = (d: number) => (d * Math.PI) / 180

function seedFleet(): Satellite[] {
  return [
    {
      id: 'hyp-1',
      name: 'HYPERION-1',
      elements: { a: (6371 + 420) / 6371, e: 0.0012, i: deg(51.6), raan: 0.8, argp: 0.3, m0: 0, epoch: 0 },
      fuel: 450, fuelCapacity: 450,
    },
    {
      id: 'hyp-2',
      name: 'HYPERION-2',
      elements: { a: (6371 + 780) / 6371, e: 0.002, i: deg(97.5), raan: 2.4, argp: 1.1, m0: 2.0, epoch: 0 },
      fuel: 380, fuelCapacity: 380,
    },
  ]
}

export function burnCost(p: BurnPlan): number {
  return Math.hypot(p.prograde, p.normal, p.radial)
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Wall-clock seconds a burn takes to fly: 1s per 20 m/s, clamped 2..8. */
export function burnDuration(costMs: number): number {
  return Math.min(8, Math.max(2, costMs / 20))
}

/** Quality (0..1) scales overspend: perfect = planned cost, worst = +25%. */
export function fuelCostWithQuality(costMs: number, quality: number): number {
  return costMs * (1 + 0.25 * (1 - clamp01(quality)))
}

export interface BurnSession {
  satId: string
  plan: BurnPlan
  cost: number
  duration: number
}

export function previewElements(sat: Satellite, plan: BurnPlan, at: number): OrbitalElements {
  return applyDeltaV(sat.elements, at, {
    prograde: plan.prograde * MS_TO_ER,
    normal: plan.normal * MS_TO_ER,
    radial: plan.radial * MS_TO_ER,
  })
}

interface GameState {
  satellites: Satellite[]
  selectedId: string | null
  burnPlan: BurnPlan
  previewAt?: number
  burnSession: BurnSession | null
  /** Non-reactive live burn telemetry — direct-mutated by the engine, polled by the overlay. */
  burnLive: { needle: number; progress: number; quality: number }
  select(id: string | null): void
  setBurnPlan(p: Partial<BurnPlan>): void
  resetBurnPlan(): void
  /** Apply the current plan to the selected satellite at sim time `at`. Returns success. */
  executeBurn(at: number): boolean
  beginBurn(): boolean
  completeBurn(at: number, quality: number): boolean
  abortBurn(): void
  resetForTest(): void
}

export const useGameStore = create<GameState>((set, get) => ({
  satellites: seedFleet(),
  selectedId: null,
  burnPlan: { ...ZERO_PLAN },
  previewAt: 0,
  burnSession: null,
  burnLive: { needle: 0, progress: 0, quality: 1 },

  select: (id) => set({ selectedId: id, burnPlan: { ...ZERO_PLAN } }),

  setBurnPlan: (p) => set((s) => ({ burnPlan: { ...s.burnPlan, ...p } })),

  resetBurnPlan: () => set({ burnPlan: { ...ZERO_PLAN } }),

  executeBurn: (at) => {
    const { satellites, selectedId, burnPlan } = get()
    const sat = satellites.find((s) => s.id === selectedId)
    if (!sat) return false
    const cost = burnCost(burnPlan)
    if (cost <= 0 || cost > sat.fuel) return false
    const elements = previewElements(sat, burnPlan, at)
    set({
      satellites: satellites.map((s) =>
        s.id === sat.id ? { ...s, elements, fuel: s.fuel - cost } : s,
      ),
      burnPlan: { ...ZERO_PLAN },
    })
    return true
  },

  beginBurn: () => {
    const { satellites, selectedId, burnPlan } = get()
    const sat = satellites.find((s) => s.id === selectedId)
    if (!sat) return false
    const cost = burnCost(burnPlan)
    if (cost <= 0 || cost * 1.25 > sat.fuel) return false
    const live = get().burnLive
    live.needle = 0; live.progress = 0; live.quality = 1
    set({ burnSession: { satId: sat.id, plan: { ...burnPlan }, cost, duration: burnDuration(cost) } })
    return true
  },

  completeBurn: (at, quality) => {
    const { satellites, burnSession } = get()
    if (!burnSession) return false
    const sat = satellites.find((s) => s.id === burnSession.satId)
    if (!sat) { set({ burnSession: null }); return false }
    const elements = previewElements(sat, burnSession.plan, at)
    const spent = Math.min(sat.fuel, fuelCostWithQuality(burnSession.cost, quality))
    set({
      satellites: satellites.map((s) =>
        s.id === sat.id ? { ...s, elements, fuel: s.fuel - spent } : s,
      ),
      burnSession: null,
      burnPlan: { prograde: 0, normal: 0, radial: 0 },
    })
    const live = get().burnLive
    live.needle = 0; live.progress = 0; live.quality = 1
    return true
  },

  abortBurn: () => set({ burnSession: null }),

  resetForTest: () => {
    const live = get().burnLive
    live.needle = 0; live.progress = 0; live.quality = 1
    set({ satellites: seedFleet(), selectedId: null, burnPlan: { ...ZERO_PLAN }, previewAt: 0, burnSession: null })
  },
}))
