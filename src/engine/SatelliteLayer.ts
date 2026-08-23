import * as THREE from 'three'
import { orbitPathPoints, propagate, sceneFromEci } from '@/lib/orbits'
import { useGameStore, previewElements, burnCost } from '@/state/gameStore'
import { buildSatelliteModel, type SatelliteModel } from '@/engine/satelliteModel'
import { subsolarPoint, latLonToVector3 } from '@/lib/geo'
import { hashPhase } from '@/engine/eventIcons'

const GHOST = 0xffb86b
const SELECTED = 0xa8ecff

/** Renders the fleet: marker + orbit ribbon per satellite, plus the burn-preview ghost orbit. */
export class SatelliteLayer {
  readonly group = new THREE.Group()
  private markers = new Map<string, SatelliteModel>()
  private hits = new Map<string, THREE.Mesh>()
  private ribbons = new Map<string, THREE.LineLoop>()
  private ghost: THREE.LineLoop
  private lastGhostRebuild = 0
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
    for (const model of this.markers.values()) {
      this.group.remove(model.group)
      model.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (obj.material instanceof THREE.MeshBasicMaterial) obj.material.dispose()
        }
      })
    }
    this.markers.clear()

    for (const map of [this.hits, this.ribbons] as const) {
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

      const model = buildSatelliteModel(selected)
      this.group.add(model.group)
      this.markers.set(sat.id, model)

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
          color: selected ? SELECTED : 0x45d8ff,
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
    const sub = subsolarPoint(new Date())
    const sun = latLonToVector3(sub.lat, sub.lon, 1).normalize()
    for (const sat of satellites) {
      const sv = propagate(sat.elements, simTime)
      const p = sceneFromEci(sv.position)
      const model = this.markers.get(sat.id)
      if (model) {
        model.group.position.copy(p)
        model.group.up.copy(sun) // wings roughly sunward
        model.group.lookAt(p.clone().add(sceneFromEci(sv.velocity).normalize()))
        model.navLight.visible = Math.sin(simTime * 0.4 + hashPhase(sat.id)) > 0
      }
      this.hits.get(sat.id)?.position.copy(p)
    }
    // Keep ghost orbit current as sim time advances (~1.3°/wall-second at 20×).
    // Throttled to 4 Hz (every 5 sim-seconds = 0.25 wall-seconds at 20×).
    if (this.ghost.visible && simTime - this.lastGhostRebuild > 5) {
      this.lastGhostRebuild = simTime
      this.rebuildGhost()
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
