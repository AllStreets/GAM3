import { create } from 'zustand'
import {
  applyDeltaV, MS_TO_ER, orbitalPeriod, type OrbitalElements,
} from '@/lib/orbits'
import { planeForTarget } from '@/lib/aimPlane'
import { recordBurn, recordAbort } from '@/lib/profile'
import { refuelPrice, SATELLITE_PRICE, refuelPricePerDv, affordableRefuelDv } from '@/lib/economy'
import { tankUpgradeCost, tankUpgradeDv, RETROFIT_COST } from '@/lib/upgrades'
import { useAgencyStore } from '@/state/agencyStore'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import {
  type Capability, type ServiceRecord,
  seedCapability, fillGapCapability, freshRecord, simDaysInOrbit,
} from '@/lib/satelliteMeta'
import { closestApproach, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import { scoreManeuver, detectTrickShot, type ManeuverScore } from '@/lib/maneuverScore'
import { useContractStore } from '@/state/contractStore'
import { useStoryStore } from '@/state/storyStore'
import {
  type Conjunction, shouldSpawnConjunction, makeConjunction,
  isResolvedByBurn, isExpired,
} from '@/lib/emergency'

export interface Satellite {
  id: string
  name: string
  elements: OrbitalElements
  /** Remaining delta-v budget, m/s. */
  fuel: number
  fuelCapacity: number
  capability: Capability
  record: ServiceRecord
  /** Tank upgrade level — 0 at launch, incremented by upgradeTank(). */
  tankLevel: number
}

export interface BurnPlan {
  prograde: number // m/s
  normal: number
  radial: number
}

const ZERO_PLAN: BurnPlan = { prograde: 0, normal: 0, radial: 0 }

const deg = (d: number) => (d * Math.PI) / 180

const FLEET_KEY = 'hyperion-fleet-v1'

function seedFleet(): Satellite[] {
  return [
    { id: 'hyp-1', name: 'HYPERION-1', elements: { a: (6371 + 420) / 6371, e: 0.0012, i: deg(51.6), raan: 0.8, argp: 0.3, m0: 0, epoch: 0 }, fuel: 1800, fuelCapacity: 1800, capability: seedCapability(0), record: freshRecord(0), tankLevel: 0 },
    { id: 'hyp-2', name: 'HYPERION-2', elements: { a: (6371 + 780) / 6371, e: 0.002, i: deg(97.5), raan: 2.4, argp: 1.1, m0: 2.0, epoch: 0 }, fuel: 1500, fuelCapacity: 1500, capability: seedCapability(1), record: freshRecord(0), tankLevel: 0 },
    { id: 'hyp-3', name: 'HYPERION-3', elements: { a: (6371 + 550) / 6371, e: 0.001, i: deg(28), raan: 4.3, argp: 0.7, m0: 3.1, epoch: 0 }, fuel: 1500, fuelCapacity: 1500, capability: seedCapability(2), record: freshRecord(0), tankLevel: 0 },
    { id: 'hyp-4', name: 'HYPERION-4', elements: { a: (6371 + 650) / 6371, e: 0.0015, i: deg(63), raan: 1.6, argp: 2.0, m0: 5.0, epoch: 0 }, fuel: 1500, fuelCapacity: 1500, capability: seedCapability(3), record: freshRecord(0), tankLevel: 0 },
    { id: 'hyp-5', name: 'HYPERION-5', elements: { a: (6371 + 500) / 6371, e: 0.001, i: deg(82), raan: 5.5, argp: 1.4, m0: 1.7, epoch: 0 }, fuel: 1500, fuelCapacity: 1500, capability: seedCapability(4), record: freshRecord(0), tankLevel: 0 },
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
  /** Transient post-burn scoring signals — not persisted, reset on resetForTest. */
  lastManeuver: ManeuverScore | null
  lastTrickShot: { count: number } | null
  /** Operational-tempo streak — consecutive contract completions; reset on failure. Not persisted. */
  streak: number
  /** Active debris-conjunction emergency, or null. NOT persisted (transient per session). */
  emergency: Conjunction | null
  /** Last sim-time a conjunction was spawned. Persisted so gaps survive reloads. */
  lastConjunctionAt: number
  /** Transient: set when a satellite is permanently lost; cleared by clearLoss(). */
  lastLoss: { name: string } | null
  select(id: string | null): void
  setBurnPlan(p: Partial<BurnPlan>): void
  resetBurnPlan(): void
  /** Apply the current plan to the selected satellite at sim time `at`. Returns success. */
  executeBurn(at: number): boolean
  beginBurn(): boolean
  completeBurn(at: number, quality: number): boolean
  abortBurn(): void
  refuelSatellite(id: string, dv?: number): boolean
  buySatellite(): boolean
  /**
   * Buy a satellite aimed at a geographic target.
   * When `target` is provided, uses `planeForTarget` to set an orbital plane
   * whose ground-track passes over the target latitude/longitude.
   * When no target is given, falls back to the existing auto-placement logic.
   * Spends `SATELLITE_PRICE` from agency funding. Returns true if purchased.
   */
  buySatelliteAimed(target?: { lat: number; lon: number }): boolean
  /**
   * Expand a satellite's fuel tank by one level.
   * Costs `tankUpgradeCost(sat.tankLevel)` funding.
   * Increases `fuelCapacity` by `tankUpgradeDv(sat.tankLevel)` and bumps `tankLevel`.
   * Returns true if the upgrade was applied (false: sat not found or insufficient funding).
   */
  upgradeTank(satId: string): boolean
  /**
   * Retrofit a satellite to a new capability type.
   * Costs `RETROFIT_COST` funding; no-op (returns false) if already that capability.
   * Returns true if the retrofit was applied.
   */
  retrofitCapability(satId: string, cap: Capability): boolean
  hydrate(): void
  recordContractPass(satId: string, note?: string): void
  bumpStreak(): void
  resetStreak(): void
  clearLastManeuver(): void
  /** Reset the conjunction gap timer to `now` and clear any active emergency (per-session). */
  startEmergencyClock(now: number): void
  /** Check and possibly spawn a conjunction; supply a deterministic roll ∈ [0,1). */
  maybeSpawnConjunction(now: number, roll: number): void
  /** Clear the emergency when the burned sat has spent enough Δv. */
  resolveEmergencyByBurn(satId: string, dvSpent: number): void
  /** Pay fuel cost to dodge without flying; returns false if insufficient fuel. */
  payEvasion(): boolean
  /** Permanently remove a satellite; grant a free provisional replacement if fleet would reach 0. */
  loseSatellite(satId: string): void
  /** Dismiss the loss-beat overlay. */
  clearLoss(): void
  /** Called every engine tick: if emergency is expired, lose the satellite. */
  tickEmergency(now: number): void
  /**
   * Emergency refit: spend a refit token from the agency to fully refuel a satellite
   * for FREE. Returns true if a token was available and the satellite exists.
   * Returns false if no token or the satellite is already full.
   * Emits a story dispatch on success.
   */
  emergencyRefit(satId: string): boolean
  resetForTest(): void
}

export const useGameStore = create<GameState>((set, get) => ({
  satellites: seedFleet(),
  selectedId: null,
  burnPlan: { ...ZERO_PLAN },
  previewAt: 0,
  burnSession: null,
  burnLive: { needle: 0, progress: 0, quality: 1 },
  lastManeuver: null,
  lastTrickShot: null,
  streak: 0,
  emergency: null,
  lastConjunctionAt: 0,
  lastLoss: null,

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
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })
    return true
  },

  beginBurn: () => {
    if (get().burnSession) return false
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

    // Compute maneuver score against the tracked/first active contract target.
    const allContracts = useContractStore.getState().contracts
    const activeContracts = allContracts.filter((c) => c.status === 'active')
    const targetId = useContractStore.getState().targetId
    const targetContract =
      (targetId ? activeContracts.find((c) => c.id === targetId) : null) ??
      activeContracts[0] ??
      null

    const windowSec = orbitalPeriod(elements.a) * 3
    const closestKm = targetContract
      ? closestApproach(elements, { lat: targetContract.lat, lon: targetContract.lon }, at, windowSec).closestKm
      : 0

    const maneuverScore = scoreManeuver({
      dvNeeded: burnSession.cost,
      dvSpent: spent,
      closestKm,
      radiusKm: COMPLETION_RADIUS_KM,
    })

    const allTargets = activeContracts.map((c) => ({ lat: c.lat, lon: c.lon }))
    const trickResult = detectTrickShot({ elements, targets: allTargets, fromT: at, windowSec, radiusKm: COMPLETION_RADIUS_KM })
    const lastTrickShot = trickResult.isTrickShot ? { count: trickResult.count } : null

    set({
      satellites: satellites.map((s) =>
        s.id === sat.id ? { ...s, elements, fuel: s.fuel - spent } : s,
      ),
      burnSession: null,
      burnPlan: { prograde: 0, normal: 0, radial: 0 },
      lastManeuver: maneuverScore,
      lastTrickShot,
    })
    recordBurn(burnSession.cost, quality)
    const live = get().burnLive
    live.needle = 0; live.progress = 0; live.quality = 1

    // If there's an active emergency on this satellite, resolve it if spent >= requiredDv.
    get().resolveEmergencyByBurn(burnSession.satId, spent)

    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })
    return true
  },

  abortBurn: () => { recordAbort(); set({ burnSession: null }) },

  bumpStreak: () => set((s) => ({ streak: s.streak + 1 })),
  resetStreak: () => set({ streak: 0 }),
  clearLastManeuver: () => set({ lastManeuver: null, lastTrickShot: null }),

  refuelSatellite: (id, dv?) => {
    const sat = get().satellites.find((s) => s.id === id)
    if (!sat) return false
    const missing = sat.fuelCapacity - sat.fuel
    if (missing <= 0) return false
    const pricePerDv = refuelPricePerDv(useAgencyStore.getState().refuelEfficiencyLevel ?? 0)
    const funds = useAgencyStore.getState().funding
    // Determine the Δv to buy: explicit arg (capped), or the affordable partial amount.
    const targetDv = dv != null
      ? Math.min(dv, missing)
      : affordableRefuelDv(missing, funds, pricePerDv)
    if (targetDv <= 0) return false
    const cost = Math.ceil(targetDv * pricePerDv)
    if (!useAgencyStore.getState().spendFunding(cost)) return false
    set((s) => ({
      satellites: s.satellites.map((x) =>
        x.id === id ? { ...x, fuel: Math.min(x.fuelCapacity, x.fuel + targetDv) } : x,
      ),
    }))
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })
    return true
  },

  buySatellite: () => {
    if (!useAgencyStore.getState().spendFunding(SATELLITE_PRICE)) return false
    const n = get().satellites.length + 1
    // Fresh LEO orbit; RAAN/argp offset per index so new coverage differs from existing planes.
    const sat: Satellite = {
      id: `hyp-${n}-${Math.round(get().previewAt ?? 0)}`,
      name: `HYPERION-${n}`,
      elements: {
        a: (6371 + 500 + n * 40) / 6371, e: 0.001, i: deg(63 + n * 5),
        raan: (0.6 * n) % (Math.PI * 2), argp: (0.4 * n) % (Math.PI * 2), m0: (1.1 * n) % (Math.PI * 2), epoch: 0,
      },
      fuel: 1500, fuelCapacity: 1500,
      capability: fillGapCapability(get().satellites.map((s) => s.capability)),
      record: freshRecord(get().previewAt ?? 0),
      tankLevel: 0,
    }
    set((s) => ({ satellites: [...s.satellites, sat] }))
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })
    return true
  },

  buySatelliteAimed: (target) => {
    if (!target) return get().buySatellite()
    if (!useAgencyStore.getState().spendFunding(SATELLITE_PRICE)) return false
    const n = get().satellites.length + 1
    const aimElements = planeForTarget(target.lat, target.lon, n)
    const sat: Satellite = {
      id: `hyp-${n}-${Math.round(get().previewAt ?? 0)}`,
      name: `HYPERION-${n}`,
      elements: {
        a: aimElements.a ?? (6371 + 500) / 6371,
        e: aimElements.e ?? 0.001,
        i: aimElements.i ?? deg(51.6),
        raan: aimElements.raan ?? 0,
        argp: aimElements.argp ?? 0,
        m0: aimElements.m0 ?? 0,
        epoch: aimElements.epoch ?? 0,
      },
      fuel: 1500, fuelCapacity: 1500,
      capability: fillGapCapability(get().satellites.map((s) => s.capability)),
      record: freshRecord(get().previewAt ?? 0),
      tankLevel: 0,
    }
    set((s) => ({ satellites: [...s.satellites, sat] }))
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })
    return true
  },

  upgradeTank: (satId) => {
    const sat = get().satellites.find((s) => s.id === satId)
    if (!sat) return false
    const cost = tankUpgradeCost(sat.tankLevel)
    if (!useAgencyStore.getState().spendFunding(cost)) return false
    const dv = tankUpgradeDv(sat.tankLevel)
    set((s) => ({
      satellites: s.satellites.map((x) =>
        x.id === satId
          ? { ...x, fuelCapacity: x.fuelCapacity + dv, tankLevel: x.tankLevel + 1 }
          : x,
      ),
    }))
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })
    return true
  },

  retrofitCapability: (satId, cap) => {
    const sat = get().satellites.find((s) => s.id === satId)
    if (!sat) return false
    if (sat.capability === cap) return false
    if (!useAgencyStore.getState().spendFunding(RETROFIT_COST)) return false
    set((s) => ({
      satellites: s.satellites.map((x) =>
        x.id === satId ? { ...x, capability: cap } : x,
      ),
    }))
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })
    return true
  },

  hydrate: () => {
    const raw = loadJSON<{ satellites: Satellite[]; lastConjunctionAt?: number }>(
      FLEET_KEY,
      { satellites: seedFleet(), lastConjunctionAt: 0 },
    )
    const backfilled = raw.satellites.map((s, index) => ({
      ...s,
      capability: s.capability ?? seedCapability(index),
      record: s.record ?? freshRecord(0),
      tankLevel: s.tankLevel ?? 0,
    }))
    set({ satellites: backfilled, lastConjunctionAt: raw.lastConjunctionAt ?? 0 })
  },

  recordContractPass: (satId, note) => {
    set((s) => ({
      satellites: s.satellites.map((sat) =>
        sat.id === satId
          ? {
              ...sat,
              record: {
                ...sat.record,
                contractsCompleted: sat.record.contractsCompleted + 1,
                notablePasses: note
                  ? [note, ...sat.record.notablePasses].slice(0, 6)
                  : sat.record.notablePasses,
              },
            }
          : sat,
      ),
    }))
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })
  },

  // ── Emergency actions ──────────────────────────────────────────────────────

  startEmergencyClock: (now) => {
    // Reset the conjunction gap timer to `now` and clear any active emergency.
    // Called once per session (first founded engine tick) so emergencies never
    // fire on load or over the founding screen — always a full min-gap into play.
    set({ lastConjunctionAt: now, emergency: null })
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: now })
  },

  maybeSpawnConjunction: (now, roll) => {
    const { emergency, lastConjunctionAt, satellites } = get()
    if (emergency) return // already an active emergency
    if (!shouldSpawnConjunction({
      now,
      lastSpawnAt: lastConjunctionAt,
      minGapSec: 3600,
      fleetSize: satellites.length,
      roll,
    })) return

    // Pick satellite deterministically from roll.
    const idx = Math.min(
      Math.floor(roll * satellites.length),
      satellites.length - 1,
    )
    const sat = satellites[idx]
    if (!sat) return

    const conjunction = makeConjunction(sat.id, now)
    set({ emergency: conjunction, lastConjunctionAt: now })
    // Lazy import to avoid circular dependency in tests.
    if (typeof window !== 'undefined') {
      // audio is browser-only; safe to import at runtime in game context.
      import('@/audio/AudioEngine').then(({ audio }) => audio.alert()).catch(() => undefined)
    }
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: now })
  },

  resolveEmergencyByBurn: (satId, dvSpent) => {
    const { emergency } = get()
    if (!emergency) return
    if (emergency.satId !== satId) return
    if (!isResolvedByBurn(emergency, dvSpent)) return
    const now = get().previewAt ?? 0
    const sat = get().satellites.find((s) => s.id === satId)
    const days = sat ? simDaysInOrbit(sat.record.commissionedAt, now) : 0
    get().recordContractPass(satId, `Evaded conjunction · SD ${days}`)
    set({ emergency: null })
  },

  payEvasion: () => {
    const { emergency, satellites } = get()
    if (!emergency) return false
    const sat = satellites.find((s) => s.id === emergency.satId)
    if (!sat) return false
    if (sat.fuel < emergency.requiredDv) return false // insufficient fuel
    set((s) => ({
      satellites: s.satellites.map((x) =>
        x.id === emergency.satId ? { ...x, fuel: x.fuel - emergency.requiredDv } : x,
      ),
      emergency: null,
    }))
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })
    return true
  },

  loseSatellite: (satId) => {
    const { satellites } = get()
    const sat = satellites.find((s) => s.id === satId)
    if (!sat) return
    const remaining = satellites.filter((s) => s.id !== satId)

    if (remaining.length === 0) {
      // Never-ruin: grant a free provisional replacement.
      const n = satellites.length + 1
      const provisional: Satellite = {
        id: `hyp-prov-${Math.round(get().previewAt ?? 0)}`,
        name: `HYPERION-${n}`,
        elements: {
          a: (6371 + 500) / 6371, e: 0.001, i: deg(51.6),
          raan: 0.8, argp: 0.3, m0: 0, epoch: 0,
        },
        fuel: 1500, fuelCapacity: 1500,
        capability: seedCapability(0),
        record: freshRecord(get().previewAt ?? 0),
        tankLevel: 0,
      }
      set({ satellites: [provisional], emergency: null, lastLoss: { name: sat.name } })
    } else {
      set({ satellites: remaining, emergency: null, lastLoss: { name: sat.name } })
    }
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })
  },

  clearLoss: () => set({ lastLoss: null }),

  tickEmergency: (now) => {
    const { emergency } = get()
    if (!emergency) return
    if (isExpired(emergency, now)) {
      get().loseSatellite(emergency.satId)
    }
  },

  emergencyRefit: (satId) => {
    const sat = get().satellites.find((s) => s.id === satId)
    if (!sat) return false
    if (sat.fuel >= sat.fuelCapacity) return false // already full

    // Attempt to spend a token from the agency.
    if (!useAgencyStore.getState().spendRefitToken()) return false

    // Fully refuel for free.
    set((s) => ({
      satellites: s.satellites.map((x) =>
        x.id === satId ? { ...x, fuel: x.fuelCapacity } : x,
      ),
    }))
    saveJSON(FLEET_KEY, { satellites: get().satellites, lastConjunctionAt: get().lastConjunctionAt })

    // Emit a story dispatch.
    useStoryStore.getState().addDispatch({
      id: `emergency-refit-${satId}-${Date.now()}`,
      at: Date.now(),
      text: `Emergency refit — ${sat.name} fully fuelled.`,
      source: 'story',
    })

    return true
  },

  // ── End emergency actions ──────────────────────────────────────────────────

  resetForTest: () => {
    clearKey(FLEET_KEY)
    const live = get().burnLive
    live.needle = 0; live.progress = 0; live.quality = 1
    set({
      satellites: seedFleet(),
      selectedId: null,
      burnPlan: { ...ZERO_PLAN },
      previewAt: 0,
      burnSession: null,
      lastManeuver: null,
      lastTrickShot: null,
      streak: 0,
      emergency: null,
      lastConjunctionAt: 0,
      lastLoss: null,
    })
  },
}))

// Expose the store on window in non-production so Playwright e2e tests can
// seed fleet state and inspect satellites without relying on the game engine.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  ;(window as unknown as Record<string, unknown>).__gameStore = useGameStore
}
