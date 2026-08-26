/**
 * story-engine.spec.ts — smoke tests for Plan-9 story engine (T6).
 *
 * Tests:
 *  (a) A contract shows an objective label / progress chip once accepted.
 *  (b) DispatchesFeed appears once a dispatch is present (seeded via dev hook).
 *
 * Pattern follows the existing e2e suite:
 *  - `foundAgency()` helper mirrors globe.spec.ts.
 *  - Uses `window.__storyStore` and `window.__contractStore` dev hooks
 *    (exposed in non-production builds) to seed state without AI routes.
 *  - No imports from @/ paths — types are inlined to stay compatible with
 *    Playwright's module resolution context.
 */

import { test, expect } from '@playwright/test'

// ─── Inline types (avoid @/ path imports in e2e context) ─────────────────────

interface Dispatch {
  id: string
  at: number
  text: string
  source: 'story' | 'rival'
}

interface Objective {
  type: 'single-pass' | 'multi-pass' | 'multi-sat' | 'dwell'
  label: string
  params: { passes?: number; sats?: number; dwellSec?: number }
}

interface Contract {
  id: string
  eventId: string
  title: string
  objective?: string
  gameObjective?: Objective
  kind: string
  lat: number
  lon: number
  /** sim-time seconds (use getSimNow() helper to compute in-browser) */
  deadline: number
  reward: { funding: number; reputation: number }
  status: 'available' | 'active' | 'completed' | 'failed'
  archetype: 'relief' | 'research' | 'defense'
  preferredCapability: 'imaging' | 'comms' | 'thermal'
}

// ─── foundAgency helper (mirrors globe.spec.ts) ───────────────────────────────

async function foundAgency(page: import('@playwright/test').Page) {
  await page.goto('/')
  const commission = page.getByRole('button', { name: 'COMMISSION AGENCY' })
  await page.waitForTimeout(300)
  if (await commission.isVisible().catch(() => false)) {
    await commission.click()
  }
  await expect(commission).toBeHidden()
}

// ─── Dev-hook helpers ─────────────────────────────────────────────────────────

/**
 * Get the current sim-time in-browser. simNow() = (now - origin) * 20.
 * Computed in-browser so it's always correct even if the origin changes.
 */
async function getSimNow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    // Mirror of src/lib/simTime.ts: SIM_ORIGIN_S + (Date.now()/1000 - WALL_ORIGIN_S) * 20
    const WALL_ORIGIN_S = Date.UTC(2026, 0, 1) / 1000
    const SIM_ORIGIN_S = 0
    const TIME_SCALE = 20
    return SIM_ORIGIN_S + (Date.now() / 1000 - WALL_ORIGIN_S) * TIME_SCALE
  })
}

/** Seed a dispatch directly into storyStore via the window dev hook. */
async function seedDispatch(
  page: import('@playwright/test').Page,
  dispatch: Dispatch,
): Promise<void> {
  await page.evaluate((d: Dispatch) => {
    const store = (window as unknown as Record<string, unknown>).__storyStore as
      | { getState(): { addDispatch(d: Dispatch): void } }
      | undefined
    store?.getState().addDispatch(d)
  }, dispatch)
}

/** Seed an available contract via the window dev hook. */
async function seedContract(
  page: import('@playwright/test').Page,
  contract: Contract,
): Promise<void> {
  await page.evaluate((c: Contract) => {
    const store = (window as unknown as Record<string, unknown>).__contractStore as
      | { getState(): { addContract(c: Contract): void } }
      | undefined
    store?.getState().addContract(c)
  }, contract)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('DispatchesFeed appears when a story dispatch is seeded', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text())
  })

  await foundAgency(page)

  // Wait for store hydration (Fleet panel confirms stores are mounted).
  await expect(page.locator('h2').filter({ hasText: /^FLEET$/ })).toBeVisible({ timeout: 10_000 })

  // Seed a story dispatch via dev hook.
  const dispatch: Dispatch = {
    id: 'test-dispatch-001',
    at: Date.now(),
    text: 'Agency Command logs the first tasking cycle. The board is active.',
    source: 'story',
  }
  await seedDispatch(page, dispatch)

  // DispatchesFeed should now appear (it renders whenever dispatches.length > 0).
  const feedHeader = page.locator('h2').filter({ hasText: /^DISPATCHES$/ })
  await expect(feedHeader).toBeVisible({ timeout: 5_000 })

  // The dispatch text should be visible.
  await expect(page.getByText('Agency Command logs the first tasking cycle. The board is active.')).toBeVisible()

  // COMM chip should be visible (source === 'story' → COMM label).
  // Use exact + role to avoid collisions with dispatch text containing 'Comm' substrings.
  await expect(page.locator('span').filter({ hasText: /^COMM$/ }).first()).toBeVisible()

  // No console errors introduced.
  expect(pageErrors).toEqual([])
})

test('DispatchesFeed shows RIVAL chip for rival-source dispatches', async ({ page }) => {
  await foundAgency(page)
  await expect(page.locator('h2').filter({ hasText: /^FLEET$/ })).toBeVisible({ timeout: 10_000 })

  const dispatch: Dispatch = {
    id: 'test-dispatch-rival-001',
    at: Date.now(),
    text: 'VANTIS Corp reached the target before your agency.',
    source: 'rival',
  }
  await seedDispatch(page, dispatch)

  await expect(page.locator('h2').filter({ hasText: /^DISPATCHES$/ })).toBeVisible({ timeout: 5_000 })
  // RIVAL chip is rendered for source === 'rival'
  await expect(page.getByText('RIVAL')).toBeVisible()
})

test('contract with gameObjective shows objective chip once accepted', async ({ page }) => {
  await foundAgency(page)
  await expect(page.locator('h2').filter({ hasText: /^FLEET$/ })).toBeVisible({ timeout: 10_000 })

  // Deadline must be in sim-time seconds (simNow() runs at 20x real time).
  const simNow = await getSimNow(page)
  // Give plenty of sim-time headroom (5 orbital periods at ~90min = ~5400s real → 108000 sim-sec).
  const deadlineSec = simNow + 108_000

  const gameObjective: Objective = {
    type: 'multi-pass',
    label: 'Monitor storm — 3 imaging passes',
    params: { passes: 3 },
  }

  const contract: Contract = {
    id: 'test-contract-objective-001',
    eventId: 'test-event-001',
    title: 'Storm Watch: Typhoon Keoni',
    objective: 'Conduct three imaging passes over the storm system.',
    gameObjective,
    kind: 'storm',
    lat: 15.2,
    lon: 143.8,
    deadline: deadlineSec,
    reward: { funding: 320, reputation: 18 },
    status: 'available',
    archetype: 'relief',
    preferredCapability: 'imaging',
  }

  await seedContract(page, contract)

  // The contract title should appear in the available list.
  await expect(page.getByText('Storm Watch: Typhoon Keoni')).toBeVisible({ timeout: 5_000 })

  // The narrative objective description should be visible beneath the title.
  await expect(page.getByText('Conduct three imaging passes over the storm system.')).toBeVisible()

  // Accept the contract.
  const contractLi = page.locator('li').filter({ hasText: 'Storm Watch: Typhoon Keoni' })
  const acceptBtn = contractLi.getByRole('button', { name: 'ACCEPT' })
  await expect(acceptBtn).toBeVisible()
  await acceptBtn.click()

  // After accepting, the contract moves to active.
  // The gameObjective label chip should appear in the active card.
  await expect(page.getByText('Monitor storm — 3 imaging passes')).toBeVisible({ timeout: 5_000 })
  // Progress chip shows initial state: "PASS 0/3"
  await expect(page.getByText('PASS 0/3')).toBeVisible({ timeout: 3_000 })
})

test('seeded contract narrative objective is visible before accept', async ({ page }) => {
  await foundAgency(page)
  await expect(page.locator('h2').filter({ hasText: /^FLEET$/ })).toBeVisible({ timeout: 10_000 })

  const simNow = await getSimNow(page)
  const deadlineSec = simNow + 108_000

  const contract: Contract = {
    id: 'test-contract-objective-002',
    eventId: 'test-event-002',
    title: 'Flood Assessment: Mekong Delta',
    objective: 'Map inundated farmland for relief coordination.',
    gameObjective: {
      type: 'single-pass',
      label: 'Capture target — single pass',
      params: {},
    },
    kind: 'flood',
    lat: 10.5,
    lon: 105.8,
    deadline: deadlineSec,
    reward: { funding: 180, reputation: 10 },
    status: 'available',
    archetype: 'relief',
    preferredCapability: 'imaging',
  }

  await seedContract(page, contract)

  // Narrative objective text shows as italic description in the available card.
  await expect(page.getByText('Map inundated farmland for relief coordination.')).toBeVisible({ timeout: 5_000 })
})
