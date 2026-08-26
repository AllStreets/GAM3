/**
 * persistence.spec.ts — Plan-11 persistence smoke tests (Task 4).
 *
 * Tests (all run signed-out — no interactive Clerk auth in e2e):
 *  (a) Founding + play work with no console ERRORS when the server is reachable.
 *      The Clerk dev-keys WARNING ("Clerk: Missing publishableKey") is expected and
 *      allowed — the assertion only fails on console.error events, not warnings.
 *  (b) After founding, the /api/save endpoint is reachable (returns 200 with JSON).
 *      The route degrades to { ok: false, reason: ... } when the DB is absent —
 *      either outcome is acceptable here; what must NOT happen is a 4xx/5xx crash.
 *  (c) The PersistBridge component mounts (the DOM has no crash marker) and the
 *      game runs from localStorage when the DB is unavailable.
 */

import { test, expect } from '@playwright/test'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function foundAgency(page: import('@playwright/test').Page) {
  await page.goto('/')
  const commission = page.getByRole('button', { name: 'COMMISSION AGENCY' })
  await page.waitForTimeout(300)
  if (await commission.isVisible().catch(() => false)) {
    await commission.click()
  }
  await expect(commission).toBeHidden()
  // Wait for stores to hydrate.
  await expect(page.locator('h2').filter({ hasText: /^FLEET$/ })).toBeVisible({ timeout: 10_000 })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('persistence smoke (signed-out / anon path)', () => {
  test('(a) founding + play produce no console errors (Clerk dev-key warning allowed)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))
    page.on('console', (m) => {
      // Only capture errors — warnings (including Clerk's dev-keys note) are fine.
      if (m.type() === 'error') errors.push(m.text())
    })

    await foundAgency(page)
    // Allow the bridge's async load + write-through to settle.
    await page.waitForTimeout(2000)

    expect(errors).toEqual([])
  })

  test('(b) /api/save is reachable and returns 200 JSON (degrades gracefully when DB absent)', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(500)

    // POST to /api/save with a synthetic anon-id and a valid store key.
    // Either { ok: true } (DB up) or { ok: false, reason: ... } (DB down) is fine.
    // A network error or non-200 HTTP status would fail this test.
    const result = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-anon-id': 'e2e-test-anon-id-smoke',
          },
          body: JSON.stringify({ key: 'hyperion-agency-v1', data: { founded: false } }),
        })
        const json = await res.json()
        return { status: res.status, json }
      } catch (e) {
        return { status: 0, error: String(e) }
      }
    })

    // Route must return 200 (ALWAYS-200 contract from T1).
    expect(result.status).toBe(200)
    // Response must have an `ok` boolean field.
    expect(typeof (result.json as { ok: boolean }).ok).toBe('boolean')
  })

  test('(c) localStorage-backed game survives bridge mount when server is unreachable', async ({ page }) => {
    // Intercept /api/load so it looks like the server is down.
    await page.route('/api/load', (route) => route.abort('failed'))
    await page.route('/api/save', (route) => route.abort('failed'))

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

    await foundAgency(page)
    await page.waitForTimeout(2000)

    // No JS errors even though the server is unreachable.
    expect(errors).toEqual([])

    // The canvas still renders (game is running from localStorage).
    const isBlack = await page.evaluate(() => {
      const c = document.querySelector('canvas') as HTMLCanvasElement | null
      if (!c) return true
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

  test('(d) save→reload: agency name persists in localStorage when bridge is offline', async ({ page }) => {
    // Block server routes so we test the pure localStorage path.
    await page.route('/api/load', (route) => route.abort('failed'))
    await page.route('/api/save', (route) => route.abort('failed'))

    await foundAgency(page)

    // Read the agency name that was written to localStorage.
    const agencyName = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('hyperion-agency-v1')
        if (!raw) return null
        const parsed = JSON.parse(raw) as { name?: string }
        return parsed.name ?? null
      } catch {
        return null
      }
    })

    // The agency must have a name set (founding always writes one).
    expect(typeof agencyName).toBe('string')
    expect((agencyName as string).length).toBeGreaterThan(0)

    // Reload: the same name should still be there (localStorage survived).
    await page.reload()
    await page.waitForTimeout(1000)

    const agencyNameAfterReload = await page.evaluate(() => {
      try {
        const raw = localStorage.getItem('hyperion-agency-v1')
        if (!raw) return null
        const parsed = JSON.parse(raw) as { name?: string }
        return parsed.name ?? null
      } catch {
        return null
      }
    })

    expect(agencyNameAfterReload).toBe(agencyName)
  })
})
