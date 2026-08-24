/**
 * postcard.ts — Orbital postcard compositor.
 * Client-only (DOM Canvas). SSR-guarded.
 */

// ── Pure helpers (testable in Node/vitest) ──────────────────────────────────

export interface PostcardCaptionOpts {
  /** Active contract title, if one is targeted */
  contractTitle?: string
  /** Sim time in seconds (from simNow()) */
  simTime: number
}

/**
 * Build a one-line postcard caption from game state.
 * Pure function — no DOM, no Three, safe to test in Node.
 */
export function postcardCaption({ contractTitle, simTime }: PostcardCaptionOpts): string {
  // Stardate: year + fractional day (sim time starts at 2026-01-01)
  const SIM_ORIGIN_WALL = Date.UTC(2026, 0, 1) / 1000 // wall-clock seconds at sim t=0
  const TIME_SCALE = 20
  const wallS = SIM_ORIGIN_WALL + simTime / TIME_SCALE
  const d = new Date(wallS * 1000)
  const year = d.getUTCFullYear()
  const jan1 = Date.UTC(year, 0, 1) / 1000
  const dayOfYear = (wallS - jan1) / 86400
  const stardate = `${year}.${Math.floor(dayOfYear).toString().padStart(3, '0')}`

  if (contractTitle) {
    return `${contractTitle} — SD ${stardate}`
  }
  return `Orbital view — SD ${stardate}`
}

// ── Canvas compositor (DOM-only) ─────────────────────────────────────────────

export interface CompositeOpts {
  agencyName: string
  emblemSvg: string
  caption: string
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = src
  })
}

/**
 * Composite a WebGL frame with agency branding and return a PNG data URL.
 * Client-only — rejects (and returns '') in SSR environments.
 */
export async function composePostcard(
  frameDataUrl: string,
  opts: CompositeOpts,
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return ''
  }

  const { agencyName, emblemSvg, caption } = opts

  // Load the base frame
  const frameImg = await loadImage(frameDataUrl)

  const W = frameImg.naturalWidth || frameImg.width
  const H = frameImg.naturalHeight || frameImg.height

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return frameDataUrl

  // 1. Draw the WebGL frame
  ctx.drawImage(frameImg, 0, 0, W, H)

  // 2. Bottom gradient bar
  const barH = Math.round(H * 0.2)
  const grad = ctx.createLinearGradient(0, H - barH, 0, H)
  grad.addColorStop(0, 'rgba(3,5,9,0)')
  grad.addColorStop(0.45, 'rgba(3,5,9,0.72)')
  grad.addColorStop(1, 'rgba(3,5,9,0.92)')
  ctx.fillStyle = grad
  ctx.fillRect(0, H - barH, W, barH)

  // 3. HYPERION watermark top-right
  const watermarkSize = Math.round(W * 0.018)
  ctx.font = `600 ${watermarkSize}px monospace`
  ctx.letterSpacing = `${watermarkSize * 0.4}px`
  ctx.fillStyle = 'rgba(69,216,255,0.55)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText('HYPERION', W - Math.round(W * 0.025), Math.round(H * 0.022))
  ctx.letterSpacing = '0px'

  // 4. Agency name
  const nameSize = Math.round(H * 0.034)
  ctx.font = `700 ${nameSize}px monospace`
  ctx.fillStyle = '#e6edf3'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  const leftPad = Math.round(W * 0.03)
  // Leave room for emblem (emblemSize + gap)
  const emblemSize = Math.round(H * 0.08)
  const emblemPad = leftPad + emblemSize + Math.round(W * 0.02)
  ctx.fillText(agencyName.toUpperCase(), emblemPad, H - Math.round(H * 0.085))

  // 5. Caption
  const captionSize = Math.round(H * 0.022)
  ctx.font = `400 ${captionSize}px monospace`
  ctx.fillStyle = 'rgba(69,216,255,0.85)'
  ctx.textBaseline = 'bottom'
  ctx.fillText(caption, emblemPad, H - Math.round(H * 0.042))

  // 6. Emblem SVG → image (graceful fallback if load fails)
  try {
    const svgBlob = new Blob([emblemSvg], { type: 'image/svg+xml' })
    const svgUrl = URL.createObjectURL(svgBlob)
    try {
      const emblemImg = await loadImage(svgUrl)
      const ey = H - Math.round(H * 0.05) - emblemSize
      ctx.drawImage(emblemImg, leftPad, ey, emblemSize, emblemSize)
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  } catch {
    // Emblem failed to load — postcard is still produced without it
  }

  return canvas.toDataURL('image/png')
}
