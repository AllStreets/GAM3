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
