import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EARTH_RADIUS } from '@/lib/geo'

export class GlobeEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private frameHandle = 0
  private resizeObserver: ResizeObserver
  protected earth: THREE.Mesh

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
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

    // Placeholder material — replaced by the day/night shader in Task 4.
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 96, 96),
      new THREE.MeshBasicMaterial({ color: 0x0a2a4a }),
    )
    this.scene.add(this.earth)

    this.scene.add(this.buildStarfield())

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
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
    return new THREE.Points(geometry, material)
  }

  private handleResize() {
    const host = this.canvas.parentElement ?? this.canvas
    const { clientWidth: w, clientHeight: h } = host
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Per-frame hook — extended by later tasks. */
  protected update(_elapsedSeconds: number) {}

  start() {
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
    this.renderer.render(this.scene, this.camera)
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
    cancelAnimationFrame(this.frameHandle)
    this.resizeObserver.disconnect()
    this.controls.dispose()
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
