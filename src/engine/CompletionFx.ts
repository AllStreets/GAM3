import * as THREE from 'three'
import { latLonToVector3 } from '@/lib/geo'

/** Expanding+fading additive ring over the completion target. ~3s lifetime. */
export class CompletionFx {
  readonly group = new THREE.Group()

  private ring: THREE.Mesh
  private ringMat: THREE.MeshBasicMaterial
  private ringGeo: THREE.RingGeometry
  private life = 0       // seconds remaining
  private readonly DURATION = 3
  private _focusSat: string | null = null

  constructor() {
    this.ringGeo = new THREE.RingGeometry(0.02, 0.03, 64)
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat)
    this.ring.visible = false
    this.group.add(this.ring)
  }

  trigger(lat: number, lon: number, satId: string): void {
    const pos = latLonToVector3(lat, lon, 1.001)
    this.ring.position.copy(pos)
    // Orient ring face-on to the surface normal (same pattern as ContractLayer ring).
    this.ring.lookAt(pos.clone().multiplyScalar(2))
    this.ring.scale.setScalar(1)
    this.ringMat.opacity = 0.9
    this.ring.visible = true
    this.life = this.DURATION
    this._focusSat = satId
  }

  update(dt: number): void {
    if (this.life <= 0) return
    this.life -= dt
    if (this.life <= 0) {
      this.life = 0
      this.ring.visible = false
      this._focusSat = null
      return
    }
    // Expand outward over the lifetime; fade in the last third.
    const t = 1 - this.life / this.DURATION   // 0→1
    const scale = 1 + t * 3.5                 // grows from 1x to 4.5x
    this.ring.scale.setScalar(scale)
    // Fade: ramp in quickly then fade out
    const fadeIn = Math.min(1, t * 6)
    const fadeOut = this.life / this.DURATION  // 1→0
    this.ringMat.opacity = 0.85 * fadeIn * fadeOut
  }

  get active(): boolean {
    return this.life > 0
  }

  get focusSat(): string | null {
    return this._focusSat
  }

  dispose(): void {
    this.group.remove(this.ring)
    this.ringGeo.dispose()
    this.ringMat.dispose()
  }
}
