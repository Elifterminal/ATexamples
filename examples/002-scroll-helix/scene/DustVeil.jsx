import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { SPARK } from './lighting.js'

// A sheath of very small particles orbiting the helix's own central axis — the
// X axis, the one the form is swept along. Orbiting around X is what puts them
// in front of the glass and then behind it, which is the whole read: the veil
// has to cross the form, not sit beside it.
//
// Built as smoke and it came out as dust, so it is dust now — the difference is
// that dust is made of discrete motes that catch the light individually, which
// is a thing to lean into rather than blur away.
//
// Stateless, like the flow inside the tube. Position is a pure function of the
// particle's seed and four accumulators, so 40k particles cost a handful of
// uniform writes a frame and nothing else touches the CPU.
const VERTEX = /* glsl */ `
  uniform float uOrbit;
  uniform float uDrift;
  uniform float uTime;
  uniform float uCalm;
  uniform float uSpan;
  uniform float uInner;
  uniform float uShell;
  uniform float uTurbulence;
  uniform float uBillow;
  uniform float uWander;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform vec3 uLightDir;
  uniform vec3 uHalfDir;
  uniform float uAmbient;
  uniform float uContrast;
  uniform float uGlintRate;
  uniform float uGlintTightness;

  attribute float aAxis;
  attribute float aAngle;
  attribute float aShell;
  attribute float aSpin;
  attribute float aDrag;
  attribute float aSeed;
  attribute float aSize;
  attribute float aGlint;

  varying float vFade;
  varying float vLight;
  varying float vGlint;

  const float TAU = 6.283185307179586;

  void main() {
    // Scroll shifts every particle along the axis and fract() wraps it, so the
    // volume can never be emptied out by scrolling far in one direction. aDrag
    // varies per particle — without that spread the whole veil slides as one
    // rigid block, which reads as a moving object rather than as dust.
    float axis = fract(aAxis + uDrift * aDrag);
    float x = (axis - 0.5) * uSpan;

    // Signed spin. Some particles orbit one way, some the other, so the veil
    // churns through itself instead of turning like a wheel.
    float angle = aAngle + uOrbit * aSpin;

    // Three cheap out-of-phase waves standing in for turbulence. Real curl noise
    // is the right answer and costs more than it's worth at this density — at
    // this particle size nobody can resolve a single path, only the aggregate.
    float seed = aSeed * TAU;
    float n1 = sin(x * 0.31 + uTime * 0.61 + seed);
    float n2 = sin(angle * 1.7 - uTime * 0.44 + seed * 1.7);
    float n3 = sin(x * 0.17 - uTime * 0.29 + seed * 2.3);

    // Every turbulence term is gated by uCalm, which is 0 while the scroll is
    // moving and eases to 1 once it stops. Driven, the veil streams; let go, it
    // breaks up and wanders. That contrast is the effect.
    angle += (n1 * 0.6 + n2 * 0.35) * uTurbulence * uCalm;

    // Billow moves a particle through the thickness of the sheath rather than
    // scaling its radius. Scaling let a particle at the inner edge get pushed
    // 22% inward — straight through the glass wall it is supposed to be orbiting
    // outside of. Displacing the shell fraction instead makes the clearance
    // structural: radius can't leave [uInner, uInner + uShell] whatever the noise
    // does. Reflected at both ends, not clamped, because a clamp piles particles
    // into a bright ring right at the glass, which is where the eye already is.
    float s = abs(aShell + (n2 * 0.5 + n3 * 0.5) * uBillow * uCalm);
    s = 1.0 - abs(1.0 - s);

    float radius = uInner + s * uShell;
    x += n3 * uWander * uCalm;

    vec3 pos = vec3(x, sin(angle) * radius, cos(angle) * radius);
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    // The mote's own outward direction, straight off the axis. Same normal the
    // flow inside the tube uses, so both particle systems and the glass all
    // agree about where the light is.
    vec3 n = vec3(0.0, sin(angle), cos(angle));
    float lam = dot(n, uLightDir) * 0.5 + 0.5;
    vLight = uAmbient + (1.0 - uAmbient) * pow(lam, uContrast);

    // The sparkle. A mote glints when its facet happens to line up with the
    // light — so the geometric half-vector term decides WHERE a glint is
    // possible, and a per-particle flicker decides WHEN. Multiplying the two is
    // what stops it reading as a uniform blink: glints cluster in the band that
    // actually faces the key, and only a few fire at a time. aGlint is zero for
    // most of the population, so only some motes ever catch at all.
    float facet = pow(max(dot(n, uHalfDir), 0.0), uGlintTightness);
    float flicker = pow(max(sin(uTime * uGlintRate * (0.6 + aSeed) + seed * 3.1), 0.0), 26.0);

    vGlint = facet * flicker * aGlint;

    // The wrap seam. Particles recycling from one end to the other would pop in
    // at full brightness right at the edge of frame, so they fade across the
    // last eighth at each end instead.
    vFade = smoothstep(0.0, 0.12, axis) * smoothstep(1.0, 0.88, axis);

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
  // the veil inside the tube wall at the default radius — invisible in a still,
  // obvious the moment you know the tube has a thickness of its own.
  const surface = radius + tube

  const material = useRef()
  const orbitPhase = useRef(0)
  const drift = useRef(0)
  const time = useRef(0)
  const calm = useRef(1)

  // Where a glint is geometrically possible: halfway between the light and the
  // camera, which looks straight down -Z. Computed here rather than per vertex,
  // since neither the camera's facing nor the light changes per frame.
  const half = useMemo(
    () => direction.clone().add(new THREE.Vector3(0, 0, 1)).normalize(),
    [direction],
  )

  const geometry = useMemo(() => {
    const random = mulberry32(907)
    const geo = new THREE.BufferGeometry()

    const axis = new Float32Array(count)
    const angle = new Float32Array(count)
    const shellPos = new Float32Array(count)
    const spin = new Float32Array(count)
    const drag = new Float32Array(count)
    const seed = new Float32Array(count)
    const sizes = new Float32Array(count)
    const glint = new Float32Array(count)

    for (let i = 0; i < count; i += 1) {
      axis[i] = random()
      angle[i] = random() * Math.PI * 2

      // Biased inward rather than uniform through the shell, so the veil is
      // densest against the glass and thins outward. Uniform reads as a tube of
      // fog the form happens to sit inside.
      shellPos[i] = random() ** 1.6

      const spinDirection = random() < counter ? -1 : 1
      spin[i] = spinDirection * (0.4 + random() * 1.0)

      drag[i] = 0.55 + random() * 0.9
      seed[i] = random()
      sizes[i] = 0.5 + random() * 1.1

      // Only a minority are ever reflective. If every mote can glint the effect
      // reads as the whole field pulsing rather than as individual specks
      // catching the light, and varying the strength stops the ones that do fire
      // from all firing equally hard.
      glint[i] = random() < sparkleFraction ? 0.45 + random() * 1.1 : 0
    }

    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geo.setAttribute('aAxis', new THREE.BufferAttribute(axis, 1))
    geo.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1))
    geo.setAttribute('aShell', new THREE.BufferAttribute(shellPos, 1))
    geo.setAttribute('aSpin', new THREE.BufferAttribute(spin, 1))
    geo.setAttribute('aDrag', new THREE.BufferAttribute(drag, 1))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geo.setAttribute('aGlint', new THREE.BufferAttribute(glint, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), span)

    return geo
  }, [count, counter, span, sparkleFraction])

  // Same leak the tube had: useMemo swaps the geometry but never frees the old
  // one, so every drag of the count slider strands a buffer on the GPU.
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      uOrbit: { value: 0 },
      uDrift: { value: 0 },
      uTime: { value: 0 },
      uCalm: { value: 1 },
      uSpan: { value: span },
      uInner: { value: surface * inner },
      uShell: { value: surface * shell },
      uTurbulence: { value: turbulence },
      uBillow: { value: billow },
      uWander: { value: wander },
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

    const velocity = scroll.current.velocity
    const speed = Math.abs(velocity)

    time.current += delta

    // Orbit never stops — scroll only adds to it. Same reasoning as the flow
    // inside the tube: tie it to scroll alone and the veil dies in your hands
    // the moment you stop moving.
    orbitPhase.current += delta * (orbit + speed * orbitSurge)

    // Signed, so the veil is dragged the way the scroll went rather than just
    // agitated by it.
    drift.current += delta * velocity * follow

    // Eased, not switched. Snapping turbulence on the frame the wheel stops is
    // instantly readable as a state change; arriving over half a second reads
    // as the dust settling.
    const target = 1 - Math.min(1, speed * 2.5)
    calm.current += (target - calm.current) * Math.min(1, delta * settle)

    const u = material.current.uniforms

    u.uOrbit.value = orbitPhase.current
    u.uDrift.value = drift.current
    u.uTime.value = time.current
    u.uCalm.value = calm.current
    u.uSpan.value = span
    u.uInner.value = surface * inner
    u.uShell.value = surface * shell
    u.uTurbulence.value = turbulence
    u.uBillow.value = billow
    u.uWander.value = wander
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
          it — without that the veil draws over the form and the orbit flattens
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
