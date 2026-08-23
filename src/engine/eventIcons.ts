import * as THREE from 'three'
import type { EventKind } from '@/lib/worldEvents'

/** Stable per-id animation phase in [0, 2π). */
export function hashPhase(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((h >>> 0) % 100) / 100 * Math.PI * 2
}

const cache = new Map<EventKind, THREE.CanvasTexture>()

function draw(kind: EventKind, ctx: CanvasRenderingContext2D) {
  const c = 64 // center
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'

  if (kind === 'quake') {
    // Seismic: solid epicenter dot + two broken concentric rings
    ctx.beginPath(); ctx.arc(c, c, 9, 0, Math.PI * 2); ctx.fill()
    for (const [r, gap] of [[28, 0.5], [46, 0.7]] as const) {
      for (let k = 0; k < 3; k++) {
        const a0 = (k * 2 * Math.PI) / 3 + gap
        ctx.beginPath(); ctx.arc(c, c, r, a0, a0 + (2 * Math.PI) / 3 - gap); ctx.stroke()
      }
    }
  } else if (kind === 'wildfire') {
    // Flame teardrop with inner cutout
    ctx.beginPath()
    ctx.moveTo(64, 8)
    ctx.bezierCurveTo(30, 44, 22, 70, 30, 90)
    ctx.bezierCurveTo(38, 110, 54, 120, 64, 120)
    ctx.bezierCurveTo(74, 120, 90, 110, 98, 90)
    ctx.bezierCurveTo(106, 70, 98, 44, 64, 8)
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.moveTo(64, 62)
    ctx.bezierCurveTo(50, 80, 50, 94, 64, 104)
    ctx.bezierCurveTo(78, 94, 78, 80, 64, 62)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  } else if (kind === 'storm') {
    // Cyclone: eye + three curved arms
    ctx.beginPath(); ctx.arc(c, c, 12, 0, Math.PI * 2); ctx.stroke()
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3
      ctx.beginPath()
      ctx.arc(
        c + Math.cos(a) * 18, c + Math.sin(a) * 18,
        26, a + Math.PI * 0.15, a + Math.PI * 0.85,
      )
      ctx.stroke()
    }
  } else {
    // Rocket: nose + body + fins + exhaust notch
    ctx.beginPath()
    ctx.moveTo(64, 10)
    ctx.bezierCurveTo(84, 34, 84, 64, 78, 88) // right side
    ctx.lineTo(50, 88)
    ctx.bezierCurveTo(44, 64, 44, 34, 64, 10) // left side
    ctx.fill()
    // fins
    ctx.beginPath(); ctx.moveTo(50, 70); ctx.lineTo(30, 96); ctx.lineTo(50, 92); ctx.fill()
    ctx.beginPath(); ctx.moveTo(78, 70); ctx.lineTo(98, 96); ctx.lineTo(78, 92); ctx.fill()
    // window
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath(); ctx.arc(64, 44, 8, 0, Math.PI * 2); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    // exhaust
    ctx.beginPath(); ctx.moveTo(54, 96); ctx.lineTo(64, 118); ctx.lineTo(74, 96); ctx.fill()
  }
}

/** White glyph texture for an event kind, cached. Tint via SpriteMaterial color. */
export function getEventIconTexture(kind: EventKind): THREE.CanvasTexture {
  const hit = cache.get(kind)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  draw(kind, canvas.getContext('2d')!)
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  cache.set(kind, tex)
  return tex
}
