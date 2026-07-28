import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { SPARK } from './lighting.js'
import {
  ORBIT_GLSL,
  advanceOrbit,
  applyOrbitAttributes,
  createOrbitState,
  orbitAttributes,
  orbitUniforms,
  writeOrbitUniforms,
} from './orbit.js'

// A sheath of very small motes orbiting the helix's own central axis — the X
// axis, the one the form is swept along. Orbiting around X is what puts them in
// front of the glass and then behind it, which is the whole read: the sheath has
// to cross the form, not sit beside it.
//
// Built as smoke and it came out as dust, so it is dust now — the difference is
// that dust is made of discrete motes that catch the light individually, which
// is a thing to lean into rather than blur away.
//
// The orbital motion lives in orbit.js and is shared with the hex plates.
// Position is a pure function of the mote's seed and four accumulators, so 40k
// motes cost a handful of uniform writes a frame and nothing touches the CPU.
const VERTEX = /* glsl */ `
  ${ORBIT_GLSL}

  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uLightDir;
  uniform vec3 uHalfDir;
  uniform float uAmbient;
  uniform float uContrast;
  uniform float uGlintRate;
  uniform float uGlintTightness;

  attribute float aGlint;

  varying float vFade;
  varying float vLight;
  varying float vGlint;

  void main() {
    Orbit o = sampleOrbit();

    vec4 mvPosition = modelViewMatrix * vec4(o.pos, 1.0);

    // The mote's own outward direction, straight off the axis — the same normal
    // the flow inside the tube uses, so both particle systems and the glass all
    // agree about where the light is.
    float lam = dot(o.shellNormal, uLightDir) * 0.5 + 0.5;
    vLight = uAmbient + (1.0 - uAmbient) * pow(lam, uContrast);

    // The sparkle. A mote glints when its facet happens to line up with the
    // light — so the half-vector term decides WHERE a glint is possible, and a
    // per-particle flicker decides WHEN. Multiplying the two is what stops it
    // reading as a uniform blink: glints cluster in the band that actually faces
    // the key, and only a few fire at a time. aGlint is zero for most of the
    // population, so only some motes ever catch at all.
    float facet = pow(max(dot(o.shellNormal, uHalfDir), 0.0), uGlintTightness);
    float flicker = pow(max(sin(uTime * uGlintRate * (0.6 + aSeed) + aSeed * 19.5), 0.0), 26.0);

    vGlint = facet * flicker * aGlint;
    vFade = o.fade;

    // A glinting mote grows a little. A sparkle that only brightens stays the
    // same speck; the size change is most of what sells it as catching light.
    gl_PointSize = uSize * aSize * uPixelRatio * (12.0 / -mvPosition.z) * (1.0 + vGlint * 0.9);
    gl_Position = projectionMatrix * mvPosition;
  }
`

// Two profiles in one sprite: a broad soft mote, and a much tighter core that
// only shows up when the particle is glinting. Cubing the falloff was the first
// attempt at the mote and it was wrong — it put almost all the alpha in the
// middle few pixels, so every particle read as a hard dot and the bloom pass
// picked those centres out as sparkles. Which is funny in hindsight: it was
// accidentally doing this, to the whole population, permanently. Now it's
// deliberate, on a few of them, occasionally.
const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSparkColor;
  uniform float uOpacity;
  uniform float uSparkle;

  varying float vFade;
  varying float vLight;
  varying float vGlint;

  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;

    // Subtracting the value at the cutoff takes the alpha to exactly zero at the
    // rim, so the discard never leaves a visible circular edge.
    float mote = max(exp(-d * d * 12.0) - 0.05, 0.0);
    float spark = max(exp(-d * d * 64.0) - 0.02, 0.0);

    float a = (mote * vLight * uOpacity + spark * vGlint * uSparkle) * vFade;

    gl_FragColor = vec4(mix(uColor, uSparkColor, clamp(vGlint, 0.0, 1.0)), a);
  }
`

export function DustVeil({
  count,
  span,
  radius,
  tube,
  inner,
  shell,
  counter,
  colour,
  opacity,
  size,
  orbit,
  orbitSurge,
  follow,
  turbulence,
  billow,
  wander,
  settle,
  scroll,
  direction,
  ambient,
  contrast,
  sparkle,
  sparkleFraction,
  sparkleRate,
  sparkleTightness,
}) {
  // Clearance is measured from the outside of the glass, not from the helix
  // centreline. Measuring from the centreline quietly buried the inner third of
  // the sheath inside the tube wall at the default radius — invisible in a still,
  // obvious the moment you know the tube has a thickness of its own.
  const surface = radius + tube
  const shellInner = surface * inner
  const shellDepth = surface * shell

  const material = useRef()
  const state = useRef(createOrbitState())

  // Where a glint is geometrically possible: halfway between the light and the
  // camera, which looks straight down -Z. Computed here rather than per vertex,
  // since neither the camera's facing nor the light changes per frame.
  const half = useMemo(
    () => direction.clone().add(new THREE.Vector3(0, 0, 1)).normalize(),
    [direction],
  )

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const attributes = orbitAttributes(count, { counter })

    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    applyOrbitAttributes(geo, attributes)

    // Only a minority are ever reflective. If every mote can glint the effect
    // reads as the whole field pulsing rather than as individual specks catching
    // the light, and varying the strength stops the ones that do fire from all
    // firing equally hard.
    const glint = new Float32Array(count)
    for (let i = 0; i < count; i += 1) {
      glint[i] = attributes.random() < sparkleFraction ? 0.45 + attributes.random() * 1.1 : 0
    }

    geo.setAttribute('aGlint', new THREE.BufferAttribute(glint, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), span)

    return geo
  }, [count, counter, span, sparkleFraction])

  // Same leak the tube had: useMemo swaps the geometry but never frees the old
  // one, so every drag of the count slider strands a buffer on the GPU.
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      ...orbitUniforms({
        span,
        inner: shellInner,
        shell: shellDepth,
        turbulence,
        billow,
        wander,
      }),
      uSize: { value: size },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColor: { value: new THREE.Color(colour) },
      uSparkColor: { value: new THREE.Color(SPARK) },
      uOpacity: { value: opacity },
      uSparkle: { value: sparkle },
      uLightDir: { value: direction.clone() },
      uHalfDir: { value: half.clone() },
      uAmbient: { value: ambient },
      uContrast: { value: contrast },
      uGlintRate: { value: sparkleRate },
      uGlintTightness: { value: sparkleTightness },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useFrame((_, delta) => {
    if (!material.current) return

    advanceOrbit(state.current, delta, scroll.current.velocity, {
      orbit,
      orbitSurge,
      follow,
      settle,
    })

    const u = material.current.uniforms

    writeOrbitUniforms(u, state.current, {
      span,
      inner: shellInner,
      shell: shellDepth,
      turbulence,
      billow,
      wander,
    })

    u.uSize.value = size
    u.uOpacity.value = opacity
    u.uSparkle.value = sparkle
    u.uColor.value.set(colour)
    u.uLightDir.value.copy(direction)
    u.uHalfDir.value.copy(half)
    u.uAmbient.value = ambient
    u.uContrast.value = contrast
    u.uGlintRate.value = sparkleRate
    u.uGlintTightness.value = sparkleTightness
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      {/* depthTest stays on. It's what lets the glass hide the particles behind
          it — without that the sheath draws over the form and the orbit flattens
          into a screen-space swirl. depthWrite off so the particles don't
          occlude each other. */}
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
