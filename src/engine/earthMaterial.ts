import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;

  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    float cosAngle = dot(normalize(vWorldNormal), normalize(sunDirection));

    // Soft twilight band across the terminator.
    float dayAmount = smoothstep(-0.12, 0.12, cosAngle);

    vec3 day = texture2D(dayMap, vUv).rgb;
    // Day side gets simple diffuse shading so noon looks brighter than dawn.
    day *= 0.25 + 0.85 * max(cosAngle, 0.0);

    // City lights: warm tint, boosted so they glow (bloom picks this up).
    vec3 night = texture2D(nightMap, vUv).rgb * vec3(1.0, 0.88, 0.72) * 1.9;

    vec3 color = mix(night, day, dayAmount);

    // Faint blue ambient so the night limb never goes pure black.
    color += vec3(0.012, 0.022, 0.045) * (1.0 - dayAmount);

    gl_FragColor = vec4(color, 1.0);
  }
`

export function createEarthMaterial(
  dayMap: THREE.Texture,
  nightMap: THREE.Texture,
): THREE.ShaderMaterial {
  dayMap.colorSpace = THREE.SRGBColorSpace
  nightMap.colorSpace = THREE.SRGBColorSpace
  return new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: dayMap },
      nightMap: { value: nightMap },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader,
    fragmentShader,
  })
}
