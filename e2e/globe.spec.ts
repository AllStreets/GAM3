import { test, expect } from '@playwright/test'

async function foundAgency(page: import('@playwright/test').Page) {
  await page.goto('/')
  const commission = page.getByRole('button', { name: 'COMMISSION AGENCY' })
  // Wait briefly for store hydration (useEffect fires after mount); then click if visible.
  await page.waitForTimeout(300)
  if (await commission.isVisible().catch(() => false)) {
    await commission.click()
  }
  await expect(commission).toBeHidden()
}

test('the globe renders without errors', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text())
  })

  await page.goto('/')

  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'HYPERION' })).toBeVisible()
  await expect(page.getByText('UTC')).toBeVisible()

  // Let the intro sweep and texture loads settle, then assert a clean console.
  await page.waitForTimeout(5000)
  expect(pageErrors).toEqual([])

  // Verify the canvas is not a fully black (blank) frame.
  const isBlack = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement
    const probe = document.createElement('canvas')
    probe.width = probe.height = 64
    const ctx = probe.getContext('2d')!
    ctx.drawImage(c, 0, 0, 64, 64)
    const d = ctx.getImageData(0, 0, 64, 64).data
    let max = 0
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2])
    return max < 8
  })
  expect(isBlack).toBe(false)
})

test('fleet panel selects a satellite and plans a burn', async ({ page }) => {
  await foundAgency(page)
  await expect(page.getByText('HYPERION-1')).toBeVisible()
  await expect(page.getByText('HYPERION-2')).toBeVisible()

  const fleetAside = page.locator('aside').filter({ hasText: 'FLEET' })
  await fleetAside.getByRole('button', { name: /HYPERION-1/ }).click()
  await expect(page.getByText(/BURN PLAN — HYPERION-1/)).toBeVisible()

  // Plan a prograde burn via keyboard on the slider
  const slider = page.locator('input[type="range"]').first()
  await slider.focus()
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByText(/cost 2[0-9]\.[0-9] m\/s/)).toBeVisible()

  const ignite = page.getByRole('button', { name: 'IGNITE' })
  await expect(ignite).toBeEnabled()
  await ignite.click()
  await expect(page.getByText(/BURN IN PROGRESS/)).toBeVisible()
  // Fly the burn: hold SPACE for just over the 2s minimum duration.
  await page.keyboard.down('Space')
  await page.waitForTimeout(3600)
  await page.keyboard.up('Space')
  await expect(page.getByText(/BURN IN PROGRESS/)).not.toBeVisible({ timeout: 5_000 })
  // Fuel was spent (started at 1800/1800).
  await expect(page.getByText(/Δv 1[0-7][0-9][0-9]\/1800 m\/s/)).toBeVisible()
})

test('events panel shows live world events and focuses one', async ({ page }) => {
  await foundAgency(page)
  await expect(page.getByText('EVENTS', { exact: true })).toBeVisible()
  // Live feeds populate within the polling fetch; allow generous time.
  const firstEvent = page.locator('aside').filter({ hasText: 'EVENTS' }).locator('li button').first()
  await expect(firstEvent).toBeVisible({ timeout: 20_000 })
  await firstEvent.click()
  await expect(firstEvent).toHaveClass(/border-\[var\(--accent\)\]/)
})

test('situation briefing arrives', async ({ page }) => {
  await foundAgency(page)
  // Briefing requires events first, then a server round trip (AI or fallback).
  await expect(page.getByText('SITUATION BRIEFING')).toBeVisible({ timeout: 45_000 })
})

test('reload after founding produces no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await foundAgency(page)
  await page.reload()
  await page.waitForTimeout(2500)
  expect(errors).toEqual([])
})

test('found agency, briefing yields contracts, accept one', async ({ page }) => {
  await foundAgency(page)
  // Agency bar appears once founded.
  await expect(page.getByText(/REP 0/)).toBeVisible()
  // Contracts arrive after the briefing round-trip (AI or fallback).
  const accept = page.getByRole('button', { name: 'ACCEPT' }).first()
  await expect(accept).toBeVisible({ timeout: 45_000 })
  await accept.click()
  // An active contract now shows a T- countdown.
  await expect(page.getByText(/T-/)).toBeVisible()
  // Guidance nudge appears telling the player the next step.
  await expect(page.getByText(/Select a satellite|Drag NORMAL|IGNITE/)).toBeVisible({ timeout: 10_000 })
})

test('events panel is collapsed by default with a show-all toggle', async ({ page }) => {
  await foundAgency(page)
  await expect(page.getByRole('button', { name: /Show all \d+ events/ })).toBeVisible({ timeout: 20_000 })
})

test('walkthrough appears after founding and can be skipped', async ({ page }) => {
  // Clear persisted onboarding flag so the walkthrough is guaranteed to show
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('hyperion-onboarded-v1'))

  await foundAgency(page)

  // Walkthrough callout should appear
  await expect(page.getByTestId('walkthrough')).toBeVisible({ timeout: 5_000 })
  // Step counter starts at 1
  await expect(page.getByText(/STEP 1 \//)).toBeVisible()

  // Skip should dismiss the walkthrough
  await page.getByTestId('walkthrough-skip').click()
  await expect(page.getByTestId('walkthrough')).not.toBeVisible({ timeout: 3_000 })
})

test('walkthrough can be advanced through all steps with Next', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('hyperion-onboarded-v1'))

  await foundAgency(page)

  await expect(page.getByTestId('walkthrough')).toBeVisible({ timeout: 5_000 })

  // Advance through all steps — the last button is DONE
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('walkthrough-next').click()
  }
  // Last step: button text should be DONE
  await expect(page.getByTestId('walkthrough-next')).toHaveText('DONE')
  await page.getByTestId('walkthrough-next').click()

  // Walkthrough gone
  await expect(page.getByTestId('walkthrough')).not.toBeVisible({ timeout: 3_000 })
})

test('pressing ? opens the guide panel', async ({ page }) => {
  await foundAgency(page)

  // Guide panel should not be visible initially
  await expect(page.getByTestId('guide-panel')).not.toBeVisible()

  // Press ? to open
  await page.keyboard.press('?')
  await expect(page.getByTestId('guide-panel')).toBeVisible({ timeout: 3_000 })

  // Press Escape to close
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('guide-panel')).not.toBeVisible({ timeout: 3_000 })
})

test('guide button click opens and closes the guide panel', async ({ page }) => {
  await foundAgency(page)

  await page.getByTestId('guide-button').click()
  await expect(page.getByTestId('guide-panel')).toBeVisible({ timeout: 3_000 })

  // Click the close button inside the panel
  await page.getByRole('button', { name: 'close guide' }).click()
  await expect(page.getByTestId('guide-panel')).not.toBeVisible({ timeout: 3_000 })
})
