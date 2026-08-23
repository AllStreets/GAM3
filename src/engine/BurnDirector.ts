import * as THREE from 'three'
import { propagate, sceneFromEci } from '@/lib/orbits'
import { simNow } from '@/lib/simTime'
import { useGameStore } from '@/state/gameStore'
import { audio } from '@/audio/AudioEngine'

/**
 * Owns the burn moment: chase camera, thrust needle simulation, progress,
 * quality integration, audio rumble, and completion/abort. Keyboard state is
 * tracked with window listeners (SPACE = throttle, A/D or arrows = trim,
 * ESC = abort).
 */
export class BurnDirector {
  active = false
  /** 0..1 camera-shake energy; decays in GlobeEngine's update. */
  shake = 0

  private keys = { throttle: false, left: false, right: false }
  private qualityAccum = 0
  private qualityTime = 0
  private completionFired = false

  private onKeyDown = (ev: KeyboardEvent) => {
    if (ev.code === 'Space') { this.keys.throttle = true; if (this.active) ev.preventDefault() }
    if (ev.code === 'KeyA' || ev.code === 'ArrowLeft') this.keys.left = true
    if (ev.code === 'KeyD' || ev.code === 'ArrowRight') this.keys.right = true
    if (ev.code === 'Escape' && this.active) {
      audio.alert()
      useGameStore.getState().abortBurn()
    }
  }

  private onKeyUp = (ev: KeyboardEvent) => {
    if (ev.code === 'Space') this.keys.throttle = false
    if (ev.code === 'KeyA' || ev.code === 'ArrowLeft') this.keys.left = false
    if (ev.code === 'KeyD' || ev.code === 'ArrowRight') this.keys.right = false
  }

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    const state = useGameStore.getState()
    const session = state.burnSession

    if (!session) {
      if (this.active) {
        this.active = false
        audio.setRumble(0)
      }
      return
    }

    if (!this.active) {
      this.active = true
      this.qualityAccum = 0
      this.qualityTime = 0
      this.completionFired = false
    }

    const sat = state.satellites.find((s) => s.id === session.satId)
    if (!sat) { state.abortBurn(); return }

    // Chase camera: behind the satellite, slightly above.
    const sv = propagate(sat.elements, simNow())
    const pos = sceneFromEci(sv.position)
    const vHat = sceneFromEci(sv.velocity).normalize()
    const up = pos.clone().normalize()
    camera.position.copy(pos).addScaledVector(vHat, -0.12).addScaledVector(up, 0.05)
    camera.lookAt(pos.clone().addScaledVector(vHat, 0.1))

    // Needle: random drift fought by trim input.
    const live = state.burnLive
    const steer = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0)
    live.needle += (Math.random() - 0.5) * 2.4 * dt
    live.needle -= steer * 3.2 * dt
    live.needle = Math.max(-1, Math.min(1, live.needle))

    // Throttle advances progress; quality integrates alignment while burning.
    if (this.keys.throttle) {
      live.progress = Math.min(1, live.progress + dt / session.duration)
      const alignment = 1 - Math.abs(live.needle)
      this.qualityAccum += alignment * dt
      this.qualityTime += dt
      live.quality = this.qualityTime > 0 ? this.qualityAccum / this.qualityTime : 1
      audio.setRumble(0.35 + 0.65 * alignment)
    } else {
      audio.setRumble(0)
    }

    if (live.progress >= 1 && !this.completionFired) {
      this.completionFired = true
      const quality = live.quality
      state.completeBurn(simNow(), quality)
      this.shake = 0.55 + 0.45 * (1 - quality)
      audio.setRumble(0)
      audio.stinger()
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    audio.setRumble(0)
  }
}
