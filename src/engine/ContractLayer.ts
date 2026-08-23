import * as THREE from 'three'
import { useContractStore } from '@/state/contractStore'
import { useGameStore } from '@/state/gameStore'
import { latLonToVector3 } from '@/lib/geo'
import { subPoint } from '@/lib/intercept'
import { orbitalPeriod } from '@/lib/orbits'
import { audio } from '@/audio/AudioEngine'

const TARGET_COLOR = 0xffb86b
const TRACK_COLOR = 0x45d8ff

/** Renders active-contract legibility (target ring, selected ground-track, closest-approach marker)
 *  and drives throttled completion detection. */
export class ContractLayer {
  readonly group = new THREE.Group()
  private ring: THREE.Mesh
  private track: THREE.Line
  private marker: THREE.Mesh
  private lastEval = -1e9

  constructor() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.038, 48),
      new THREE.MeshBasicMaterial({ color: TARGET_COLOR, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.ring.visible = false
    this.group.add(this.ring)

    this.track = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: TRACK_COLOR, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.track.visible = false
    this.group.add(this.track)

    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 12, 12),
      new THREE.MeshBasicMaterial({ color: TRACK_COLOR, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.marker.visible = false
    this.group.add(this.marker)
  }

  update(simTime: number) {
    const cs = useContractStore.getState()
    const gs = useGameStore.getState()

    // Throttled completion + expiry evaluation (every ~0.5 wall-seconds worth of sim time at 20x ≈ 10 sim-sec).
    if (simTime - this.lastEval > 10) {
      this.lastEval = simTime
      const { completed, failed } = cs.evaluate(gs.satellites, simTime)
      if (completed.length) audio.stinger()
      if (failed.length) audio.alert()
    }

    // Target ring at the currently-targeted (or first active) contract.
    const target = cs.contracts.find((c) => c.id === cs.targetId && c.status === 'active')
      ?? cs.contracts.find((c) => c.status === 'active')
    if (target) {
      const p = latLonToVector3(target.lat, target.lon, 1.008)
      this.ring.position.copy(p)
      this.ring.lookAt(p.clone().multiplyScalar(2))
      const pulse = 1 + 0.12 * Math.sin(simTime * 0.5)
      this.ring.scale.setScalar(pulse)
      this.ring.visible = true
    } else {
      this.ring.visible = false
    }

    // Selected satellite's ground-track + closest-approach marker.
    const sat = gs.satellites.find((s) => s.id === gs.selectedId)
    if (sat && target) {
      const period = orbitalPeriod(sat.elements.a)
      const pts: THREE.Vector3[] = []
      let best = Infinity
      let bestPos = new THREE.Vector3()
      const N = 120
      for (let k = 0; k <= N; k++) {
        const t = simTime + (k / N) * period
        const sp = subPoint(sat.elements, t)
        const g = latLonToVector3(sp.lat, sp.lon, 1.006)
        pts.push(g)
        const d = g.distanceTo(latLonToVector3(target.lat, target.lon, 1.006))
        if (d < best) { best = d; bestPos = g.clone() }
      }
      this.track.geometry.dispose()
      this.track.geometry = new THREE.BufferGeometry().setFromPoints(pts)
      this.track.visible = true
      this.marker.position.copy(bestPos)
      this.marker.visible = true
    } else {
      this.track.visible = false
      this.marker.visible = false
    }
  }

  dispose() {
    for (const obj of [this.ring, this.track, this.marker]) {
      this.group.remove(obj)
      obj.geometry.dispose()
      ;(obj.material as THREE.Material).dispose()
    }
  }
}
