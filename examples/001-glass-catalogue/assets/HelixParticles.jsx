import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

// Position is computed in the vertex shader from the same helix formula the
// tubes are swept along. Nothing is updated on the CPU per frame, so the count
// can go into the thousands without costing anything but fill rate.
const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uRadius;
  uniform float uTurns;
  uniform float uBore;
  uniform float uSize;
  uniform float uPixelRatio;

  attribute float aT;
  attribute float aSpeed;
  attribute float aStrand;
  attribute float aSize;
  attribute vec2 aRadial;

  varying float vBright;

  const float TAU = 6.283185307179586;

  void main() {
    // fract() wraps the particle back to the start of the pipe — an endless run
    float t = fract(aT + uTime * aSpeed);
    float angle = t * uTurns * TAU + aStrand * 3.141592653589793;

    vec3 centre = vec3(
      (t - 0.5) * uLength,
      sin(angle) * uRadius,
      cos(angle) * uRadius
    );

    // The radial direction is already perpendicular to the helix tangent, so the
    // local frame comes out of the formula rather than a Frenet calculation.
    vec3 normal = vec3(0.0, sin(angle), cos(angle));
    vec3 tangent = normalize(vec3(uLength, cos(angle) * uRadius * uTurns * TAU, -sin(angle) * uRadius * uTurns * TAU));
    vec3 binormal = cross(tangent, normal);

    vec3 offset = (normal * aRadial.x + binormal * aRadial.y) * uBore;
    vec4 mvPosition = modelViewMatrix * vec4(centre + offset, 1.0);

    // Dim toward the ends so particles arrive and leave rather than popping
    vBright = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.92, t);

    gl_PointSize = uSize * aSize * uPixelRatio * (12.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;

  varying float vBright;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    // Hot core, soft halo. The halo is what reads as glow once bloom lifts it.
    float core = smoothstep(0.5, 0.0, d);
    float halo = smoothstep(0.5, 0.12, d);

    vec3 colour = uColor * (core * core * 2.2 + halo * 0.45) * uIntensity * vBright;

    gl_FragColor = vec4(colour, core * vBright);
  }
`

function mulberry32(seed) {
  let state = seed

  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0

    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function HelixParticles({
  count,
  radius,
  length,
  turns,
  bore,
  size,
  speed,
  colour,
  intensity,
}) {
  const material = useRef()

  const geometry = useMemo(() => {
    const random = mulberry32(31)
    const geo = new THREE.BufferGeometry()

    const t = new Float32Array(count)
    const speeds = new Float32Array(count)
    const strand = new Float32Array(count)
    const sizes = new Float32Array(count)
    const radial = new Float32Array(count * 2)

    for (let i = 0; i < count; i += 1) {
      t[i] = random()
      // Spread of speeds is what makes it read as flow rather than a conveyor
      speeds[i] = 0.5 + random() * 0.9
      strand[i] = random() < 0.5 ? 0 : 1
      sizes[i] = 0.45 + random() * 0.9

      // sqrt keeps the distribution even across the bore instead of crowding
      // the centre
      const angle = random() * Math.PI * 2
      const r = Math.sqrt(random()) * 0.82

      radial[i * 2] = Math.cos(angle) * r
      radial[i * 2 + 1] = Math.sin(angle) * r
    }

    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geo.setAttribute('aT', new THREE.BufferAttribute(t, 1))
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    geo.setAttribute('aStrand', new THREE.BufferAttribute(strand, 1))
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geo.setAttribute('aRadial', new THREE.BufferAttribute(radial, 2))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), length)

    return geo
  }, [count, length])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLength: { value: length },
      uRadius: { value: radius },
      uTurns: { value: turns },
      uBore: { value: bore },
      uSize: { value: size },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColor: { value: new THREE.Color(colour) },
      uIntensity: { value: intensity },
    }),
    // Values are pushed per frame below; this only builds the object once
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useFrame((state, delta) => {
    if (!material.current) return

    const u = material.current.uniforms

    u.uTime.value += delta * speed
    u.uLength.value = length
    u.uRadius.value = radius
    u.uTurns.value = turns
    u.uBore.value = bore
    u.uSize.value = size
    u.uIntensity.value = intensity
    u.uColor.value.set(colour)
  })

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
