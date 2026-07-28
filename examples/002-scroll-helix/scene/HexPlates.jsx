import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  ORBIT_GLSL,
  advanceOrbit,
  applyOrbitAttributes,
  createOrbitState,
  orbitAttributes,
  orbitUniforms,
  writeOrbitUniforms,
} from './orbit.js'

// Flat hexagonal plates hanging in the same sheath as the dust, but rare and
// much bigger. They ride the identical orbit — the motion comes from orbit.js,
// not from a second copy of it — and add one thing the dust can't have: a face.
//
// A point sprite has no orientation, so it can only ever brighten. A plate can
// turn, and turning is what lets it catch the light, flash, and disappear again
// edge-on. That's the whole reason these are real instanced geometry rather than
// bigger sprites.
const VERTEX = /* glsl */ `
  ${ORBIT_GLSL}

  uniform float uTumble;
  uniform float uSize;
  uniform vec3 uLightDir;
  uniform float uAmbient;
  uniform float uContrast;
  uniform float uFlutter;

  attribute float aTiltA;
  attribute float aTiltB;
  attribute float aRateA;
  attribute float aRateB;

  varying float vFade;
  varying float vLight;
  varying float vFacing;
  varying vec3 vNormal;

  void main() {
    Orbit o = sampleOrbit();

    // Two angles advancing at different, incommensurate rates. Because they
    // never share a period the tumble doesn't visibly loop, which is most of
    // what "random" means here. The flutter term is what makes it read as snow
    // rather than as machinery: a falling flake stalls and tips rather than
    // rotating at a constant rate.
    float pitch = aTiltA + uTumble * aRateA + uFlutter * sin(uTumble * aRateB * 1.7 + aTiltB);
    float yaw = aTiltB + uTumble * aRateB + uFlutter * sin(uTumble * aRateA * 1.3 + aTiltA);

    vec3 n = vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch));

    // Build the plate's own basis. The reference vector has to swap when the
    // normal is near vertical, or the cross product collapses and the plate
    // snaps through a degenerate orientation once per tumble.
    vec3 ref = abs(n.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(ref, n));
    vec3 bitangent = cross(n, tangent);

    vec3 world = o.pos + (tangent * position.x + bitangent * position.y) * uSize * aSize;
    vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);

    // Lit by its own face, not by where it sits on the sheath. A plate on the
    // underside whose face is turned up at the key really is catching the light,
    // and that is exactly the behaviour worth seeing as it tumbles.
    float lam = dot(n, uLightDir) * 0.5 + 0.5;
    vLight = uAmbient + (1.0 - uAmbient) * pow(lam, uContrast);

    // How square-on the plate is to the viewer. Edge-on it vanishes, which is
    // free and correct and does more for the snow read than anything else here.
    vec3 viewNormal = normalize(mat3(modelViewMatrix) * n);
    vFacing = abs(dot(viewNormal, normalize(-mvPosition.xyz)));

    vNormal = n;
    vFade = o.fade;

    gl_Position = projectionMatrix * mvPosition;
  }
`

// Iridescence as a cosine palette rather than a texture — thin-film colour is
// smooth and cyclic in the viewing angle, which is exactly what three offset
// cosines give you for a handful of instructions and no image to load.
const FRAGMENT = /* glsl */ `
  uniform vec3 uHalfDir;
  uniform vec3 uBase;
  uniform float uOpacity;
  uniform float uShine;
  uniform float uShineTightness;
  uniform float uIridSpread;
  uniform float uIridShift;
  uniform float uIridBase;

  varying float vFade;
  varying float vLight;
  varying float vFacing;
  varying vec3 vNormal;

  vec3 iridescence(float t) {
    return 0.5 + 0.5 * cos(6.283185307179586 * (t + vec3(0.0, 0.33, 0.67)));
  }

  void main() {
    // abs(), because a flake is thin enough to have two faces and either one can
    // take the light. Without it the plate is dead half the time it should be
    // flashing, for no reason a viewer could name.
    float align = abs(dot(normalize(vNormal), uHalfDir));
    float flash = pow(align, uShineTightness);

    // Hue rides the viewing angle, so the colour sweeps as the plate turns
    // instead of every plate being the same colour at once.
    vec3 tint = iridescence(uIridShift + (1.0 - vFacing) * uIridSpread);

    // Hue and flash are deliberately decoupled. Driving the colour from the
    // flash alone was the first version, and it meant a plate not currently
    // catching the light had no colour at all — the field sat grey and only the
    // few flashing plates were iridescent. The obvious fix, widening the flash
    // until everything is always flashing, buys the colour back by destroying
    // the thing the flash is for. So uIridBase carries the tint independently:
    // the plates are iridescent all the time, and catching the light adds
    // brightness on top rather than being the only source of colour.
    vec3 colour = mix(uBase, tint, clamp(uIridBase + flash * 1.4, 0.0, 1.0));
    float a = (vFacing * uOpacity * vLight + flash * uShine) * vFade;

    gl_FragColor = vec4(colour, a);
  }
`

export function HexPlates({
  count,
  span,
  radius,
  tube,
  inner,
  shell,
  counter,
  size,
  opacity,
  base,
  orbit,
  orbitSurge,
  follow,
  turbulence,
  billow,
  wander,
  settle,
  tumble,
  flutter,
  shine,
  shineTightness,
  iridSpread,
  iridShift,
  iridBase,
  scroll,
  direction,
  ambient,
  contrast,
}) {
  const surface = radius + tube
  const shellInner = surface * inner
  const shellDepth = surface * shell

  const material = useRef()
  const state = useRef(createOrbitState())
  const tumbleClock = useRef(0)

  const half = useMemo(
    () => direction.clone().add(new THREE.Vector3(0, 0, 1)).normalize(),
    [direction],
  )

  const geometry = useMemo(() => {
    // A 6-segment circle is a hexagon. Radius 1 so uSize is the only scale.
    const hex = new THREE.CircleGeometry(1, 6)
    const geo = new THREE.InstancedBufferGeometry()

    geo.index = hex.index
    geo.setAttribute('position', hex.attributes.position)
    geo.setAttribute('normal', hex.attributes.normal)
    geo.setAttribute('uv', hex.attributes.uv)
    geo.instanceCount = count

    const attributes = orbitAttributes(count, { counter, seed: 5501, radialBias: 1.15 })
    applyOrbitAttributes(geo, attributes, THREE.InstancedBufferAttribute)

    const tiltA = new Float32Array(count)
    const tiltB = new Float32Array(count)
    const rateA = new Float32Array(count)
    const rateB = new Float32Array(count)

    for (let i = 0; i < count; i += 1) {
      tiltA[i] = attributes.random() * Math.PI * 2
      tiltB[i] = attributes.random() * Math.PI * 2

      // Slow, and deliberately unequal. Snow tumbles at a rate that has nothing
      // to do with how fast it's travelling, and two plates never agree.
      rateA[i] = (0.1 + attributes.random() * 0.5) * (attributes.random() < 0.5 ? -1 : 1)
      rateB[i] = (0.1 + attributes.random() * 0.5) * (attributes.random() < 0.5 ? -1 : 1)
    }

    geo.setAttribute('aTiltA', new THREE.InstancedBufferAttribute(tiltA, 1))
    geo.setAttribute('aTiltB', new THREE.InstancedBufferAttribute(tiltB, 1))
    geo.setAttribute('aRateA', new THREE.InstancedBufferAttribute(rateA, 1))
    geo.setAttribute('aRateB', new THREE.InstancedBufferAttribute(rateB, 1))

    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), span)

    // hex's attribute objects are now owned by geo, so hex must NOT be disposed
    // here — that would free the very buffers the instanced geometry draws from.
    return geo
  }, [count, counter, span])

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
      uTumble: { value: 0 },
      uSize: { value: size },
      uOpacity: { value: opacity },
      uBase: { value: new THREE.Color(base) },
      uLightDir: { value: direction.clone() },
      uHalfDir: { value: half.clone() },
      uAmbient: { value: ambient },
      uContrast: { value: contrast },
      uFlutter: { value: flutter },
      uShine: { value: shine },
      uShineTightness: { value: shineTightness },
      uIridSpread: { value: iridSpread },
      uIridShift: { value: iridShift },
      uIridBase: { value: iridBase },
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

    // The tumble runs on its own clock rather than the orbit's. Snow keeps
    // turning at the same lazy rate whether or not it is being blown along, and
    // tying the two together made the plates spin up whenever the page scrolled,
    // which read as debris in a wind tunnel.
    tumbleClock.current += delta * tumble

    const u = material.current.uniforms

    writeOrbitUniforms(u, state.current, {
      span,
      inner: shellInner,
      shell: shellDepth,
      turbulence,
      billow,
      wander,
    })

    u.uTumble.value = tumbleClock.current
    u.uSize.value = size
    u.uOpacity.value = opacity
    u.uBase.value.set(base)
    u.uLightDir.value.copy(direction)
    u.uHalfDir.value.copy(half)
    u.uAmbient.value = ambient
    u.uContrast.value = contrast
    u.uFlutter.value = flutter
    u.uShine.value = shine
    u.uShineTightness.value = shineTightness
    u.uIridSpread.value = iridSpread
    u.uIridShift.value = iridShift
    u.uIridBase.value = iridBase
  })

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      {/* Double-sided: a flake has two faces and both should take the light.
          Additive keeps them ethereal and sidesteps sorting, which matters
          because they're large, transparent and freely overlapping. */}
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}
