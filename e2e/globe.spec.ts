import { test, expect } from '@playwright/test'

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
  await page.goto('/')
  await expect(page.getByText('HYPERION-1')).toBeVisible()
  await expect(page.getByText('HYPERION-2')).toBeVisible()

  await page.getByRole('button', { name: /HYPERION-1/ }).click()
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
  await page.goto('/')
  await expect(page.getByText('EVENTS')).toBeVisible()
  // Live feeds populate within the polling fetch; allow generous time.
  const firstEvent = page.locator('aside').filter({ hasText: 'EVENTS' }).locator('li button').first()
  await expect(firstEvent).toBeVisible({ timeout: 20_000 })
  await firstEvent.click()
  await expect(firstEvent).toHaveClass(/border-\[var\(--accent\)\]/)
})

test('situation briefing arrives', async ({ page }) => {
  await page.goto('/')
  // Briefing requires events first, then a server round trip (AI or fallback).
  await expect(page.getByText('SITUATION BRIEFING')).toBeVisible({ timeout: 45_000 })
})
