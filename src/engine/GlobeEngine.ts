import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js'
import { createEarthMaterial } from '@/engine/earthMaterial'
import { createAtmosphereMaterial } from '@/engine/atmosphereMaterial'
import { EARTH_RADIUS, latLonToVector3, subsolarPoint } from '@/lib/geo'

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

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.65, 0.82),
    )
    this.composer.addPass(new FilmPass(0.18, false))

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.handleResize()
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
  }

  /** Per-frame hook — extended by later tasks. */
  protected update(elapsedSeconds: number) {
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
    this.updateSun()
    if (this.clouds) this.clouds.rotation.y = elapsedSeconds * 0.004
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
