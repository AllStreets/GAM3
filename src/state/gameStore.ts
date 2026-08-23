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
  select(id: string | null): void
  setBurnPlan(p: Partial<BurnPlan>): void
  resetBurnPlan(): void
  /** Apply the current plan to the selected satellite at sim time `at`. Returns success. */
  executeBurn(at: number): boolean
  resetForTest(): void
}

export const useGameStore = create<GameState>((set, get) => ({
  satellites: seedFleet(),
  selectedId: null,
  burnPlan: { ...ZERO_PLAN },
  previewAt: 0,

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

  resetForTest: () => set({ satellites: seedFleet(), selectedId: null, burnPlan: { ...ZERO_PLAN }, previewAt: 0 }),
}))
