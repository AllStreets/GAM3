import * as THREE from 'three'
import { latLonToVector3 } from '@/lib/geo'
import { usePlaceStore } from '@/state/placeStore'

/** Thin additive accent ring pinned to the clicked globe point. Driven from usePlaceStore each frame. */
export class PlaceMarker {
  readonly group = new THREE.Group()

  private ring: THREE.Mesh
  private ringGeo: THREE.RingGeometry
  private ringMat: THREE.MeshBasicMaterial

  constructor() {
    // Thin ring, slightly above the surface (r=1.001), brand accent colour.
    this.ringGeo = new THREE.RingGeometry(0.018, 0.024, 48)
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x45d8ff,           // var(--accent) — matches brand teal
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat)
    this.ring.visible = false
    this.group.add(this.ring)
  }

  /** Call once per frame from GlobeEngine.update(). */
  update(): void {
    const place = usePlaceStore.getState().place
    if (!place) {
      this.ring.visible = false
      return
    }
    const pos = latLonToVector3(place.lat, place.lon, 1.001)
    this.ring.position.copy(pos)
    // Orient face-on to the surface normal (same pattern as CompletionFx / ContractLayer).
    this.ring.lookAt(pos.clone().multiplyScalar(2))
    this.ring.visible = true
  }

  dispose(): void {
    this.group.remove(this.ring)
    this.ringGeo.dispose()
    this.ringMat.dispose()
  }
}
