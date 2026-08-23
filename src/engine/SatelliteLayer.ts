import * as THREE from 'three'
import { orbitPathPoints, propagate, sceneFromEci } from '@/lib/orbits'
import { useGameStore, previewElements, burnCost } from '@/state/gameStore'

const ACCENT = 0x45d8ff
const GHOST = 0xffb86b
const SELECTED = 0xa8ecff

/** Renders the fleet: marker + orbit ribbon per satellite, plus the burn-preview ghost orbit. */
export class SatelliteLayer {
  readonly group = new THREE.Group()
  private markers = new Map<string, THREE.Mesh>()
  private hits = new Map<string, THREE.Mesh>()
  private ribbons = new Map<string, THREE.LineLoop>()
  private ghost: THREE.LineLoop
  private unsubscribe: () => void

  constructor() {
    const ghostGeom = new THREE.BufferGeometry()
    this.ghost = new THREE.LineLoop(
      ghostGeom,
      new THREE.LineBasicMaterial({ color: GHOST, transparent: true, opacity: 0.85 }),
    )
    this.ghost.visible = false
    this.group.add(this.ghost)

    this.rebuild()
    this.unsubscribe = useGameStore.subscribe((state, prev) => {
      if (state.satellites !== prev.satellites || state.selectedId !== prev.selectedId) {
        this.rebuild()
      }
      if (state.burnPlan !== prev.burnPlan || state.selectedId !== prev.selectedId || state.satellites !== prev.satellites) {
        this.rebuildGhost()
      }
    })
  }

  private clearSatObjects() {
    for (const map of [this.markers, this.hits, this.ribbons] as const) {
      for (const obj of map.values()) {
        this.group.remove(obj)
        obj.geometry.dispose()
        ;(obj.material as THREE.Material).dispose()
      }
      map.clear()
    }
  }

  private rebuild() {
    this.clearSatObjects()
    const { satellites, selectedId } = useGameStore.getState()
    for (const sat of satellites) {
      const selected = sat.id === selectedId

      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(selected ? 0.02 : 0.014),
        new THREE.MeshBasicMaterial({ color: selected ? SELECTED : ACCENT }),
      )
      this.group.add(marker)
      this.markers.set(sat.id, marker)

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.06),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      hit.userData.satelliteId = sat.id
      this.group.add(hit)
      this.hits.set(sat.id, hit)

      const pts = orbitPathPoints(sat.elements, 160).map(sceneFromEci)
      const ribbon = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: selected ? SELECTED : ACCENT,
          transparent: true,
          opacity: selected ? 0.85 : 0.35,
        }),
      )
      this.group.add(ribbon)
      this.ribbons.set(sat.id, ribbon)
    }
  }

  private rebuildGhost() {
    const { satellites, selectedId, burnPlan } = useGameStore.getState()
    const sat = satellites.find((s) => s.id === selectedId)
    if (!sat || burnCost(burnPlan) <= 0) {
      this.ghost.visible = false
      return
    }
    const el = previewElements(sat, burnPlan, useGameStore.getState().previewAt ?? 0)
    const pts = orbitPathPoints(el, 160).map(sceneFromEci)
    this.ghost.geometry.dispose()
    this.ghost.geometry = new THREE.BufferGeometry().setFromPoints(pts)
    this.ghost.visible = true
  }

  /** Position markers along their orbits. Call every frame with simNow(). */
  update(simTime: number) {
    // Ghost preview is pinned to "now" so the plan reflects burning immediately.
    useGameStore.getState().previewAt = simTime
    const { satellites } = useGameStore.getState()
    for (const sat of satellites) {
      const p = sceneFromEci(propagate(sat.elements, simTime).position)
      this.markers.get(sat.id)?.position.copy(p)
      this.hits.get(sat.id)?.position.copy(p)
    }
  }

  pickSatelliteId(raycaster: THREE.Raycaster): string | null {
    const objs = [...this.hits.values()]
    const hit = raycaster.intersectObjects(objs, false)[0]
    return hit ? ((hit.object.userData.satelliteId as string) ?? null) : null
  }

  dispose() {
    this.unsubscribe()
    this.clearSatObjects()
    this.ghost.geometry.dispose()
    ;(this.ghost.material as THREE.Material).dispose()
  }
}
