import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js'
import { createEarthMaterial } from '@/engine/earthMaterial'
import { createAtmosphereMaterial } from '@/engine/atmosphereMaterial'
import { EARTH_RADIUS, latLonToVector3, subsolarPoint } from '@/lib/geo'
import { SatelliteLayer } from '@/engine/SatelliteLayer'
import { EventLayer } from '@/engine/EventLayer'
import { ContractLayer } from '@/engine/ContractLayer'
import { CompletionFx } from '@/engine/CompletionFx'
import { simNow } from '@/lib/simTime'
import { useGameStore } from '@/state/gameStore'
import { useContractStore } from '@/state/contractStore'
import { useWorldStore } from '@/state/worldStore'
import { BurnDirector } from '@/engine/BurnDirector'
import { propagate, sceneFromEci } from '@/lib/orbits'
import { audio } from '@/audio/AudioEngine'

export class GlobeEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private frameHandle = 0
  private resizeObserver: ResizeObserver
  private earthMaterial?: THREE.ShaderMaterial
  private clouds?: THREE.Mesh
  private atmosphereMaterial?: THREE.ShaderMaterial
  private disposedFlag = false
  private composer?: EffectComposer
  private introStart: number | null = null
  private static readonly INTRO_SECONDS = 3.5
  protected earth: THREE.Mesh
  private satLayer: SatelliteLayer
  private eventLayer: EventLayer
  private contractLayer = new ContractLayer()
  private worldUnsub?: () => void
  private flight: { from: THREE.Vector3; to: THREE.Vector3; start: number } | null = null
  private pointerDown: { x: number; y: number } | null = null
  private burnDirector = new BurnDirector()
  private completionFx = new CompletionFx()
  private lastSeenCompletionId: string | null = null
  private lastElapsed = 0
  private sunLight = new THREE.DirectionalLight(0xfff4e0, 2.2)

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
    this.camera.position.set(0, EARTH_RADIUS * 0.6, EARTH_RADIUS * 3)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = EARTH_RADIUS * 1.4
    this.controls.maxDistance = EARTH_RADIUS * 8
    this.controls.enablePan = false
    this.controls.rotateSpeed = 0.45

    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 96, 96),
      new THREE.MeshBasicMaterial({ color: 0x0a2a4a }), // visible until textures load
    )
    this.scene.add(this.earth)

    const loader = new THREE.TextureLoader()
    Promise.all([
      loader.loadAsync('/textures/earth-day.jpg'),
      loader.loadAsync('/textures/earth-night.jpg'),
    ]).then(([day, night]) => {
      if (this.disposedFlag) {
        day.dispose()
        night.dispose()
        return
      }
      const old = this.earth.material as THREE.Material
      old.dispose()
      this.earthMaterial = createEarthMaterial(day, night)
      this.earth.material = this.earthMaterial
      this.updateSun()
    }).catch((err: unknown) => {
      console.error('GlobeEngine: failed to load earth textures', err)
    })

    this.scene.add(this.sunLight)
    this.scene.add(new THREE.AmbientLight(0x223347, 0.6))

    this.atmosphereMaterial = createAtmosphereMaterial()
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * 1.12, 96, 96),
      this.atmosphereMaterial,
    )
    this.scene.add(atmosphere)

    new THREE.TextureLoader().loadAsync('/textures/clouds.png').then((tex) => {
      if (this.disposedFlag) {
        tex.dispose()
        return
      }
      this.clouds = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_RADIUS * 1.008, 96, 96),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      )
      this.scene.add(this.clouds)
    }).catch(console.error)

    this.scene.add(this.buildStarfield())

    this.satLayer = new SatelliteLayer()
    this.scene.add(this.satLayer.group)

    this.eventLayer = new EventLayer()
    this.scene.add(this.eventLayer.group)

    this.scene.add(this.contractLayer.group)
    this.scene.add(this.completionFx.group)

    this.worldUnsub = useWorldStore.subscribe((state, prev) => {
      if (state.focusedId && state.focusedId !== prev.focusedId) {
        const ev = state.events.find((e) => e.id === state.focusedId)
        if (ev) this.flyTo(ev.lat, ev.lon)
      }
    })

    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.65, 0.82),
    )
    this.composer.addPass(new FilmPass(0.18, false))

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.handleResize()

    audio.armGesture()
  }

  private onPointerDown = (ev: PointerEvent) => {
    this.pointerDown = { x: ev.clientX, y: ev.clientY }
  }

  private onPointerUp = (ev: PointerEvent) => {
    const down = this.pointerDown
    this.pointerDown = null
    if (!down) return
    if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) return // drag, not click

    const rect = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndc, this.camera)
    const id = this.satLayer.pickSatelliteId(raycaster)
    useGameStore.getState().select(id)
  }

  private buildStarfield(): THREE.Points {
    const COUNT = 4000
    const positions = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      // Uniform points on a distant sphere
      const u = Math.random() * 2 - 1
      const t = Math.random() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      positions[i * 3] = 60 * s * Math.cos(t)
      positions[i * 3 + 1] = 60 * u
      positions[i * 3 + 2] = 60 * s * Math.sin(t)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: 0xbfd4e6,
      size: 0.22,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    return new THREE.Points(geometry, material)
  }

  private handleResize() {
    const host = this.canvas.parentElement ?? this.canvas
    const { clientWidth: w, clientHeight: h } = host
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    this.composer?.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private updateSun() {
    const { lat, lon } = subsolarPoint(new Date())
    const dir = latLonToVector3(lat, lon, 1).normalize()
    if (this.earthMaterial) {
      ;(this.earthMaterial.uniforms.sunDirection.value as THREE.Vector3).copy(dir)
    }
    if (this.atmosphereMaterial) {
      ;(this.atmosphereMaterial.uniforms.sunDirection.value as THREE.Vector3).copy(dir)
    }
    this.sunLight.position.copy(dir).multiplyScalar(10)
  }

  /** Ease the camera so it looks down on (lat, lon), preserving current distance. */
  private flyTo(lat: number, lon: number) {
    const dist = this.camera.position.length()
    this.flight = {
      from: this.camera.position.clone(),
      to: latLonToVector3(lat, lon, 1).normalize().multiplyScalar(dist),
      start: -1, // stamped with elapsed time on the next update tick
    }
  }

  /** Per-frame hook — extended by later tasks. */
  protected update(elapsedSeconds: number) {
    const dt = Math.min(0.05, elapsedSeconds - this.lastElapsed)
    this.lastElapsed = elapsedSeconds
    if (this.introStart === null) this.introStart = elapsedSeconds
    const t = (elapsedSeconds - this.introStart) / GlobeEngine.INTRO_SECONDS
    if (t < 1) {
      const ease = 1 - Math.pow(1 - t, 3) // cubic ease-out
      const dist = EARTH_RADIUS * (7.5 - 4.5 * ease) // 7.5 -> 3.0
      const angle = -0.5 + 0.5 * ease
      this.cameraRef.position.set(
        dist * Math.sin(angle),
        EARTH_RADIUS * (1.4 - 0.8 * ease),
        dist * Math.cos(angle),
      )
      this.cameraRef.lookAt(0, 0, 0)
      this.controlsRef.enabled = false
    } else {
      this.controlsRef.enabled = true
    }
    if (this.flight) {
      if (this.flight.start < 0) this.flight.start = elapsedSeconds
      const t = (elapsedSeconds - this.flight.start) / 1.2
      if (t >= 1) {
        this.camera.position.copy(this.flight.to)
        this.flight = null
        this.controls.enabled = true
      } else {
        const ease = 1 - Math.pow(1 - t, 3)
        this.camera.position.lerpVectors(this.flight.from, this.flight.to, ease)
        this.controls.enabled = false
      }
      this.camera.lookAt(0, 0, 0)
    }
    this.burnDirector.update(dt, this.camera)
    if (this.burnDirector.active) {
      this.controls.enabled = false
      this.flight = null // a burn cancels any event flight
    }

    // --- Completion chase-lock (below burn chase; never overrides an active burn) ---
    // Read the latest completion event from the store; trigger FX if it's new.
    const latestCompletion = useContractStore.getState().lastCompletion
    if (latestCompletion && latestCompletion.contractId !== this.lastSeenCompletionId) {
      this.lastSeenCompletionId = latestCompletion.contractId
      this.completionFx.trigger(latestCompletion.lat, latestCompletion.lon, latestCompletion.completedBy)
    }
    this.completionFx.update(dt)
    // Ease camera toward the focus satellite while FX is active and no burn is running.
    if (this.completionFx.active && !this.burnDirector.active) {
      const focusSatId = this.completionFx.focusSat
      const satellites = useGameStore.getState().satellites
      const focusSat = focusSatId ? satellites.find((s) => s.id === focusSatId) : null
      if (focusSat) {
        const sv = propagate(focusSat.elements, simNow())
        const satScene = sceneFromEci(sv.position)
        // Ease the camera to look at the satellite by gently pulling toward a
        // position that is `currentDist` away in the satellite's direction from
        // the Earth centre. Keep orbit controls disabled only while easing.
        const currentDist = this.camera.position.length()
        const target = satScene.clone().normalize().multiplyScalar(currentDist)
        this.camera.position.lerp(target, Math.min(1, dt * 1.5))
        this.camera.lookAt(0, 0, 0)
        this.controls.enabled = false
      }
    }
    // --- End completion chase-lock ---

    this.updateSun()
    if (this.clouds) this.clouds.rotation.y = elapsedSeconds * 0.004
    this.satLayer.update(simNow())
    this.eventLayer.update(elapsedSeconds)
    this.contractLayer.update(simNow())
    if (this.burnDirector.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.burnDirector.shake * 0.012
      this.camera.position.y += (Math.random() - 0.5) * this.burnDirector.shake * 0.012
      this.burnDirector.shake *= Math.exp(-3.2 * dt)
    } else {
      this.burnDirector.shake = 0
    }
  }

  start() {
    if (this.frameHandle !== 0) return
    const clock = new THREE.Clock()
    const tick = () => {
      this.frameHandle = requestAnimationFrame(tick)
      this.controls.update()
      this.update(clock.getElapsedTime())
      this.render()
    }
    tick()
  }

  /** Render hook — replaced by the composer in Task 6. */
  protected render() {
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  protected get sceneRef() {
    return this.scene
  }
  protected get cameraRef() {
    return this.camera
  }
  protected get controlsRef() {
    return this.controls
  }
  protected get rendererRef() {
    return this.renderer
  }

  dispose() {
    this.disposedFlag = true
    cancelAnimationFrame(this.frameHandle)
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.worldUnsub?.()
    this.burnDirector.dispose()
    this.completionFx.dispose()
    this.contractLayer.dispose()
    this.eventLayer.dispose()
    this.satLayer.dispose()
    this.controls.dispose()
    this.composer?.dispose()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose()
        const m = obj.material
        for (const mat of Array.isArray(m) ? m : [m]) mat.dispose()
      }
    })
    this.renderer.dispose()
  }
}
