import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

// Same analytic helix as the tube is swept along, evaluated per particle in the
// vertex shader. Nothing updates on the CPU except a single flow uniform.
const VERTEX = /* glsl */ `
  uniform float uFlow;
  uniform float uLength;
  uniform float uRadius;
  uniform float uTurns;
  uniform float uBore;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uLightDir;
  uniform float uAmbient;
  uniform float uContrast;

  attribute float aT;
  attribute float aSpeed;
  attribute float aStrand;
  attribute float aSize;
  attribute vec2 aRadial;

  varying float vBright;
  varying float vLight;

  const float TAU = 6.283185307179586;

  void main() {
    float t = fract(aT + uFlow * aSpeed);
    float angle = t * uTurns * TAU + aStrand * 3.141592653589793;

    vec3 centre = vec3(
      (t - 0.5) * uLength,
      sin(angle) * uRadius,
      cos(angle) * uRadius
    );

    vec3 normal = vec3(0.0, sin(angle), cos(angle));
    vec3 tangent = normalize(vec3(uLength, cos(angle) * uRadius * uTurns * TAU, -sin(angle) * uRadius * uTurns * TAU));
    vec3 binormal = cross(tangent, normal);

    vec3 offset = (normal * aRadial.x + binormal * aRadial.y) * uBore;
    vec4 mvPosition = modelViewMatrix * vec4(centre + offset, 1.0);

    vBright = smoothstep(0.0, 0.03, t) * smoothstep(1.0, 0.97, t);

    // normal already points from the helix's central axis out through this
    // particle, so it doubles as the surface normal for lighting: particles on
    // the upper coils face the key and the ones underneath fall away. This is
    // most of what makes the form read as top-lit — there are 22k of these and
    // they cover the glass.
    float lam = dot(normal, uLightDir) * 0.5 + 0.5;
    vLight = uAmbient + (1.0 - uAmbient) * pow(lam, uContrast);

    gl_PointSize = uSize * aSize * uPixelRatio * (12.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;

  varying float vBright;
  varying float vLight;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    float core = smoothstep(0.5, 0.0, d);
    float halo = smoothstep(0.5, 0.12, d);

    gl_FragColor = vec4(uColor * (core * core * 2.2 + halo * 0.45) * uIntensity * vBright * vLight, core * vBright);
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
  colour,
  intensity,
  drift,
  surge,
  scroll,
  direction,
  ambient,
  contrast,
}) {
  const material = useRef()
  const flow = useRef(0)

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
      speeds[i] = 0.5 + random() * 0.9
      strand[i] = random() < 0.5 ? 0 : 1
      sizes[i] = 0.45 + random() * 0.9

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

  // The tube's leak, still here. Dragging the count slider swapped the geometry
  // and stranded the old buffers on the GPU — same bug, one file over, missed
  // because the fix was applied where it was found rather than everywhere it
  // applied.
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      uFlow: { value: 0 },
      uLength: { value: length },
      uRadius: { value: radius },
      uTurns: { value: turns },
      uBore: { value: bore },
      uSize: { value: size },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColor: { value: new THREE.Color(colour) },
      uIntensity: { value: intensity },
      uLightDir: { value: direction.clone() },
      uAmbient: { value: ambient },
      uContrast: { value: contrast },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useFrame((_, delta) => {
    if (!material.current) return

    // The whole point of the test. Flow never stops — scroll velocity only adds
    // to a baseline drift, so the page is alive at rest and surges when pushed.
    // Tie this to scroll alone and it dies in the user's hands the moment they
    // stop moving.
    flow.current += delta * (drift + Math.abs(scroll.current.velocity) * surge)

    const u = material.current.uniforms

    u.uFlow.value = flow.current
    u.uLength.value = length
    u.uRadius.value = radius
    u.uTurns.value = turns
    u.uBore.value = bore
    u.uSize.value = size
    u.uIntensity.value = intensity
    u.uColor.value.set(colour)
    u.uLightDir.value.copy(direction)
    u.uAmbient.value = ambient
    u.uContrast.value = contrast
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
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
