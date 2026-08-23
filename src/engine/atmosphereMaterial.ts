import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec3 vWorldNormal;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Rendered on a slightly larger BackSide sphere: fresnel-style rim,
// brighter on the sunlit limb, deep blue on the night limb.
const fragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  varying vec3 vWorldNormal;

  void main() {
    vec3 n = normalize(vWorldNormal);
    float rim = pow(0.72 - abs(dot(n, vec3(0.0, 0.0, 1.0))) * 0.5, 3.0);
    float sunlit = smoothstep(-0.3, 0.6, dot(n, normalize(sunDirection)));
    vec3 dayGlow = vec3(0.28, 0.56, 1.0);
    vec3 nightGlow = vec3(0.04, 0.09, 0.22);
    gl_FragColor = vec4(mix(nightGlow, dayGlow, sunlit), 1.0) * rim * 1.6;
  }
`

export function createAtmosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { sunDirection: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
}
