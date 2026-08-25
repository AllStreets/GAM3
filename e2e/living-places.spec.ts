import { test, expect } from '@playwright/test'

async function foundAgency(page: import('@playwright/test').Page) {
  await page.goto('/')
  const commission = page.getByRole('button', { name: 'COMMISSION AGENCY' })
  // Wait up to 3s for the app to hydrate. If the button appears, click it to
  // found the agency. If it never appears, the agency was already founded
  // (persisted localStorage) and we proceed.
  try {
    await commission.waitFor({ state: 'visible', timeout: 3000 })
    await commission.click()
  } catch {
    // Button never showed — agency already founded from localStorage.
  }
  // Confirm the founding screen is gone.
  await expect(commission).toBeHidden({ timeout: 5000 })
}

/**
 * Open the Place Card by calling placeStore.inspect() via the window-exposed
 * store reference (set in placeStore.ts in non-production environments).
 * This avoids depending on WebGL raycasting in CI/headless environments.
 */
async function openPlaceCard(page: import('@playwright/test').Page, lat = 48.85, lon = 2.35) {
  await page.evaluate(({ lat, lon }: { lat: number; lon: number }) => {
    const store = (window as unknown as Record<string, unknown>).__placeStore as
      | { getState(): { inspect(lat: number, lon: number): void } }
      | undefined
    if (store) {
      store.getState().inspect(lat, lon)
    }
  }, { lat, lon })
}

test('Place Card appears when a location is inspected', async ({ page }) => {
  await foundAgency(page)

  // Wait for the Fleet panel heading to confirm store hydration and founding.
  await expect(page.locator('h2').filter({ hasText: /^FLEET$/ })).toBeVisible({ timeout: 10_000 })

  // Trigger the Place Card via the dev-only window store hook.
  await openPlaceCard(page)

  // PlaceCard should appear — identified by its data-testid.
  await expect(page.getByTestId('place-card')).toBeVisible({ timeout: 5000 })
})

test('Place Card FOCUS triggers City Reveal overlay', async ({ page }) => {
  await foundAgency(page)

  await expect(page.locator('h2').filter({ hasText: /^FLEET$/ })).toBeVisible({ timeout: 10_000 })

  await openPlaceCard(page)
  await expect(page.getByTestId('place-card')).toBeVisible({ timeout: 5000 })

  // Click FOCUS / ZOOM IN — triggers the city reveal camera animation.
  await page.getByRole('button', { name: 'FOCUS / ZOOM IN' }).click()

  // CityRevealOverlay blooms after ~1.1 s (BLOOM_DELAY_MS); wait generously.
  await expect(page.getByTestId('city-reveal-overlay')).toBeVisible({ timeout: 8000 })
  await expect(page.getByText('ORBITAL REVEAL')).toBeVisible({ timeout: 3000 })
})
