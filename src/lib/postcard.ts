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
  /**
   * Optional hero image URL (e.g. a Wikimedia city image from the reveal).
   * When provided it is drawn as the canvas base instead of the WebGL frame.
   * The WebGL frame is still used as a fallback if the image fails to load or
   * taints the canvas (cross-origin).
   * When absent the plain WebGL frame is used (original behaviour).
   */
  baseImageUrl?: string
  /** Attribution text shown under the hero image (shown when baseImageUrl is set). */
  imageAttribution?: string
}

function loadImage(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    if (crossOrigin) img.crossOrigin = crossOrigin
    img.src = src
  })
}

/**
 * Composite a WebGL frame (or an optional city hero image) with agency branding
 * and return a PNG data URL.
 *
 * When `opts.baseImageUrl` is provided the city image is drawn as the canvas
 * base. The image is loaded with `crossOrigin='anonymous'` so Wikimedia images
 * don't taint the canvas. If loading fails (network) or the canvas is tainted
 * (CORS failure), the function transparently falls back to the plain WebGL frame.
 *
 * Client-only — returns '' in SSR environments.
 */
export async function composePostcard(
  frameDataUrl: string,
  opts: CompositeOpts,
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return ''
  }

  const { agencyName, emblemSvg, caption, baseImageUrl, imageAttribution } = opts

  // ── Determine base image ───────────────────────────────────────────────────
  let baseImg: HTMLImageElement | null = null
  let usingCityImage = false

  if (baseImageUrl) {
    try {
      baseImg = await loadImage(baseImageUrl, 'anonymous')
      usingCityImage = true
    } catch {
      // Cross-origin load failed — fall back to WebGL frame silently
    }
  }

  // Always load the WebGL frame (used as base when no city image, or as fallback)
  const frameImg = await loadImage(frameDataUrl)

  const srcImg = usingCityImage && baseImg ? baseImg : frameImg

  // Use fixed postcard dimensions when compositing a city image (landscape 4:3)
  // so the postcard has a consistent feel regardless of the source image size.
  // For plain orbital frames we keep the original frame dimensions.
  const W = usingCityImage ? 1200 : (frameImg.naturalWidth || frameImg.width)
  const H = usingCityImage ? 900 : (frameImg.naturalHeight || frameImg.height)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return frameDataUrl

  // 1. Draw the base image (city or orbital frame)
  if (usingCityImage && baseImg) {
    // Fill black first in case the image is narrow
    ctx.fillStyle = '#030509'
    ctx.fillRect(0, 0, W, H)
    // Cover-fit: scale to fill W×H, centre-crop
    const sw = srcImg.naturalWidth || srcImg.width
    const sh = srcImg.naturalHeight || srcImg.height
    const scale = Math.max(W / sw, H / sh)
    const dw = sw * scale
    const dh = sh * scale
    const dx = (W - dw) / 2
    const dy = (H - dh) / 2
    try {
      ctx.drawImage(srcImg, dx, dy, dw, dh)
      // Verify the canvas is not tainted (toDataURL would throw if it were)
      canvas.toDataURL('image/png').slice(0, 5)
    } catch {
      // Canvas tainted — repaint with the frame only
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(frameImg, 0, 0, W, H)
      usingCityImage = false
    }
  } else {
    ctx.drawImage(frameImg, 0, 0, W, H)
  }

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

  // 5b. Image attribution (city postcard only) — tiny text, bottom-right
  if (usingCityImage && imageAttribution) {
    const attrSize = Math.round(H * 0.013)
    ctx.font = `400 ${attrSize}px monospace`
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    // Truncate to avoid overflow
    const maxAttrLen = 80
    const attrText = imageAttribution.length > maxAttrLen
      ? imageAttribution.slice(0, maxAttrLen - 1) + '…'
      : imageAttribution
    ctx.fillText(attrText, W - Math.round(W * 0.025), H - Math.round(H * 0.012))
    ctx.textAlign = 'left'
  }

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
