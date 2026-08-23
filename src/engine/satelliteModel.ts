import * as THREE from 'three'

export interface SatelliteModel {
  group: THREE.Group
  navLight: THREE.Mesh
}

const GOLD = new THREE.MeshStandardMaterial({
  color: 0xb08d2f, metalness: 0.85, roughness: 0.35,
})
const SILVER = new THREE.MeshStandardMaterial({
  color: 0xc9d1d9, metalness: 0.9, roughness: 0.25,
})
const PANEL = new THREE.MeshStandardMaterial({
  color: 0x14264f, metalness: 0.6, roughness: 0.3,
  emissive: 0x0a1e4a, emissiveIntensity: 0.55,
})
const PANEL_SELECTED = new THREE.MeshStandardMaterial({
  color: 0x1a3a72, metalness: 0.6, roughness: 0.3,
  emissive: 0x2a6bd4, emissiveIntensity: 0.9,
})
const ARM = new THREE.MeshStandardMaterial({
  color: 0x888e96, metalness: 0.8, roughness: 0.4,
})

/**
 * Procedural comms satellite: gold-foil bus, twin solar wings, dish, nav light.
 * +Z is the flight direction; solar wings span local X; dish faces -Z (nadir-ish).
 * Wingspan ~0.035 scene units. Materials are shared across instances (do NOT
 * dispose materials per-satellite — dispose geometries only).
 */
export function buildSatelliteModel(selected: boolean): SatelliteModel {
  const group = new THREE.Group()

  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.013), GOLD)
  group.add(bus)

  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.003), SILVER)
  collar.position.z = 0.008
  group.add(collar)

  // Dish: shallow cone opening toward -Z
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.0025, 20, 1, true), SILVER)
  dish.rotation.x = -Math.PI / 2
  dish.position.z = -0.008
  group.add(dish)

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.006), ARM)
  mast.rotation.x = Math.PI / 2
  mast.position.z = -0.0105
  group.add(mast)

  // Solar wings on ±X arms
  const panelMat = selected ? PANEL_SELECTED : PANEL
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0005, 0.0005, 0.005), ARM)
    arm.rotation.z = Math.PI / 2
    arm.position.x = side * 0.0065
    group.add(arm)

    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0006, 0.009), panelMat)
    wing.position.x = side * 0.016
    group.add(wing)

    // Panel seams: three thin dark strips across each wing for detail
    for (let k = -1; k <= 1; k++) {
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(0.0005, 0.0008, 0.009),
        ARM,
      )
      seam.position.set(side * (0.016 + k * 0.0045), 0, 0)
      group.add(seam)
    }
  }

  const navLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.0012, 8, 8),
    new THREE.MeshBasicMaterial({ color: selected ? 0xa8ecff : 0xff5555 }),
  )
  navLight.position.set(0, 0.006, 0)
  group.add(navLight)

  return { group, navLight }
}
