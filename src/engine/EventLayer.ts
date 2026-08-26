import * as THREE from 'three'
import { latLonToVector3 } from '@/lib/geo'
import { useWorldStore } from '@/state/worldStore'
import type { WorldEvent } from '@/lib/worldEvents'
import { getEventIconTexture, hashPhase } from '@/engine/eventIcons'

const COLORS = {
  quake: 0xff5c49,
  wildfire: 0xffa14a,
  storm: 0x9a7bff,
  launch: 0x45d8ff,
  volcano: 0xff8c42,
  flood: 0x4ab8ff,
  spaceweather: 0xffe566,
} as const

interface MarkerEntry {
  root: THREE.Group
  event: WorldEvent
  phase: number
  ripple?: THREE.Mesh
  core: THREE.Sprite
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
      if (state.events !== prev.events) {
        this.rebuild()
      } else if (state.focusedId !== prev.focusedId) {
        this.applyFocus(state.focusedId)
      }
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
        if (obj instanceof THREE.Sprite) {
          obj.material.dispose() // material only — texture is the shared cache
        }
      })
    }
    this.markers.clear()
  }

  private applyFocus(focusedId: string | null) {
    for (const entry of this.markers.values()) {
      entry.root.scale.setScalar(entry.event.id === focusedId ? 1.8 : 1)
    }
  }

  private rebuild() {
    this.clear()
    const { events, focusedId } = useWorldStore.getState()
    for (const event of events) {
      const root = new THREE.Group()
      const pos = latLonToVector3(event.lat, event.lon, 1.005)
      root.position.copy(pos)
      root.lookAt(pos.clone().multiplyScalar(2)) // +Z faces outward along the surface normal

      const color = COLORS[event.kind]
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getEventIconTexture(event.kind),
          color,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      sprite.scale.setScalar(0.03)
      root.add(sprite)
      const core = sprite

      let ripple: THREE.Mesh | undefined
      if (event.kind === 'quake') {
        ripple = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.014, 32), additiveMat(color, 0.5))
        root.add(ripple)
      } else if (event.kind === 'storm') {
        ripple = new THREE.Mesh(new THREE.RingGeometry(0.016, 0.02, 32), additiveMat(color, 0.4))
        root.add(ripple)
      }

      this.group.add(root)
      this.markers.set(event.id, { root, event, phase: hashPhase(event.id), core, ripple })
    }
    this.applyFocus(focusedId)
  }

  update(elapsedSeconds: number) {
    for (const { event, phase, ripple, core } of this.markers.values()) {
      const t = elapsedSeconds + phase
      if (event.kind === 'quake' && ripple) {
        const cycle = (t % 2) / 2
        ripple.scale.setScalar(1 + cycle * 2)
        ;(ripple.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - cycle)
      } else if (event.kind === 'wildfire') {
        ;(core.material as THREE.SpriteMaterial).opacity = 0.7 + 0.25 * Math.sin(t * 7)
      } else if (event.kind === 'storm') {
        ;(core.material as THREE.SpriteMaterial).rotation = -t * 0.8
        if (ripple) ripple.scale.setScalar(1 + 0.15 * Math.sin(t * 2))
      }
    }
  }

  dispose() {
    this.unsubscribe()
    this.clear()
  }
}
