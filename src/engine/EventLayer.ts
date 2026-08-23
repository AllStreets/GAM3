import * as THREE from 'three'
import { latLonToVector3 } from '@/lib/geo'
import { useWorldStore } from '@/state/worldStore'
import type { WorldEvent } from '@/lib/worldEvents'

const COLORS = { quake: 0xff5c49, wildfire: 0xffa14a, storm: 0x9a7bff, launch: 0x45d8ff } as const

interface MarkerEntry {
  root: THREE.Group
  event: WorldEvent
  phase: number
  ripple?: THREE.Mesh
  core: THREE.Mesh
}

function additiveMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  })
}

export class EventLayer {
  readonly group = new THREE.Group()
  private markers = new Map<string, MarkerEntry>()
  private unsubscribe: () => void

  constructor() {
    this.rebuild()
    this.unsubscribe = useWorldStore.subscribe((state, prev) => {
      if (state.events !== prev.events || state.focusedId !== prev.focusedId) this.rebuild()
    })
  }

  private clear() {
    for (const entry of this.markers.values()) {
      this.group.remove(entry.root)
      entry.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          ;(obj.material as THREE.Material).dispose()
        }
      })
    }
    this.markers.clear()
  }

  private rebuild() {
    this.clear()
    const { events, focusedId } = useWorldStore.getState()
    for (const [idx, event] of events.entries()) {
      const root = new THREE.Group()
      const pos = latLonToVector3(event.lat, event.lon, 1.005)
      root.position.copy(pos)
      root.lookAt(pos.clone().multiplyScalar(2)) // +Z faces outward along the surface normal

      const color = COLORS[event.kind]
      let core: THREE.Mesh
      let ripple: THREE.Mesh | undefined

      if (event.kind === 'quake') {
        core = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 32), additiveMat(color, 0.9))
        ripple = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.014, 32), additiveMat(color, 0.5))
        root.add(ripple)
      } else if (event.kind === 'wildfire') {
        core = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 12), additiveMat(color, 0.8))
      } else if (event.kind === 'storm') {
        core = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.02, 32), additiveMat(color, 0.75))
      } else {
        core = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.024, 12), additiveMat(color, 0.9))
        core.rotation.x = Math.PI / 2 // cone axis along +Z (outward)
      }
      root.add(core)

      if (event.id === focusedId) root.scale.setScalar(1.8)

      this.group.add(root)
      this.markers.set(event.id, { root, event, phase: idx * 0.7, core, ripple })
    }
  }

  update(elapsedSeconds: number) {
    for (const { event, phase, ripple, core } of this.markers.values()) {
      const t = elapsedSeconds + phase
      if (event.kind === 'quake' && ripple) {
        const cycle = (t % 2) / 2
        ripple.scale.setScalar(1 + cycle * 2)
        ;(ripple.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - cycle)
      } else if (event.kind === 'wildfire') {
        ;(core.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.3 * Math.sin(t * 7)
      } else if (event.kind === 'storm') {
        core.scale.setScalar(1 + 0.15 * Math.sin(t * 2))
      }
    }
  }

  dispose() {
    this.unsubscribe()
    this.clear()
  }
}
