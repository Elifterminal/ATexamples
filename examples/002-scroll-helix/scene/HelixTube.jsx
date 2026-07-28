import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Lightformer, MeshTransmissionMaterial } from '@react-three/drei'
import { HelixCurve } from './helixCurve.js'
import { BOUNCE, KEY } from './lighting.js'

// Long soft strips running the length of the form. A pipe wants a highlight that
// travels along it — that streak is what tells you it's round.
//
// The first version of this rig lit the form from above at 4.5 and from below at
// 2.2. Nearly half the key coming back up from underneath is what made everything
// look flat: with both sides lit there is no dark side, and without a dark side
// there is no shape. The bounce here is deliberately weak and cold — enough that
// the underside doesn't read as a hole, not enough to compete.
//
// The prop is keyIntensity rather than key: React consumes a prop called `key`
// for reconciliation, so it never arrives and every intensity here comes out
// undefined.
export function HelixLights({ span, direction, keyIntensity, bounce }) {
  const high = direction.clone().multiplyScalar(7)

  return (
    <>
      {/* Key. Positioned along the shared light direction so moving the light
          moves the reflection in the glass, not just the shading on the dust. */}
      <Lightformer
        intensity={keyIntensity}
        color={KEY}
        position={[high.x, high.y, high.z]}
        scale={[span, 1.6, 1]}
      />

      {/* A narrower, hotter core inside the key. One broad strip gives an even
          wash; a bright line inside a soft one is what makes the highlight read
          as a specular streak with an edge to it. */}
      <Lightformer
        intensity={keyIntensity * 1.8}
        color={KEY}
        position={[high.x * 0.8, high.y * 0.78, high.z * 0.8]}
        scale={[span, 0.35, 1]}
      />

      {/* Cold bounce from below. This is the single knob that decides whether the
          form reads as lit or as glowing — push it past about 1 and the shape
          flattens out again. */}
      <Lightformer
        intensity={bounce}
        color={BOUNCE}
        position={[0, -5.5, 1.5]}
        scale={[span, 1.2, 1]}
      />

      {/* Dim rim from behind, to keep the silhouette off the background. */}
      <Lightformer intensity={0.6} color={BOUNCE} position={[0, 1.5, -7]} scale={[span * 0.7, 3, 1]} />
    </>
  )
}

// The luminous core is drawn with an unlit material — it is emissive on purpose,
// it's the fluid inside the pipe. But unlit meant it was also the largest flat
// magenta shape in the frame, and no amount of work on the glass around it could
// overcome that. Baking a half-lambert into vertex colours gives it a top and a
// bottom for the cost of one pass over the buffer at build time, without turning
// it into a lit surface and losing the glow.
function shadeCore(geometry, direction, ambient) {
  const normals = geometry.attributes.normal
  const colours = new Float32Array(normals.count * 3)

  for (let i = 0; i < normals.count; i += 1) {
    const ndl =
      normals.getX(i) * direction.x + normals.getY(i) * direction.y + normals.getZ(i) * direction.z

    const lit = ambient + (1 - ambient) * (ndl * 0.5 + 0.5) ** 1.7

    colours[i * 3] = lit
    colours[i * 3 + 1] = lit
    colours[i * 3 + 2] = lit
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
}

export function HelixTube({
  radius,
  length,
  turns,
  tube,
  colour,
  core,
  coreScale,
  resolution,
  segmentsPerTurn,
  direction,
  ambient,
  roughness,
  clearcoat,
}) {
  // Both strands merged into one geometry so there's a single transmission pass.
  // Segment density is per-turn, so a longer helix doesn't quietly get coarser.
  const build = (tubeRadius) => {
    const strands = [0, Math.PI].map((phase) => {
      const curve = new HelixCurve(radius, length, turns, phase)
      return new THREE.TubeGeometry(curve, Math.round(turns * segmentsPerTurn), tubeRadius, 20, false)
    })

    const merged = mergeGeometries(strands)
    strands.forEach((strand) => strand.dispose())

    return merged
  }

  const glassGeometry = useMemo(() => build(tube), [radius, length, turns, tube, segmentsPerTurn])

  const coreGeometry = useMemo(() => {
    const geo = build(tube * coreScale)
    shadeCore(geo, direction, ambient)

    return geo
  }, [radius, length, turns, tube, coreScale, segmentsPerTurn, direction, ambient])

  // useMemo replaces the geometry but never frees the old one, so every slider
  // drag leaked a buffer on the GPU until the tab was closed.
  useEffect(() => () => glassGeometry.dispose(), [glassGeometry])
  useEffect(() => () => coreGeometry.dispose(), [coreGeometry])

  return (
    <>
      {/* The fluid's luminous body. Particles alone read as dust. */}
      <mesh geometry={coreGeometry} frustumCulled={false}>
        <meshBasicMaterial
          color={colour}
          vertexColors
          transparent
          opacity={core}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Low IOR on purpose — a hard refractive index bends the particles behind
          the wall into diagonal bands that read as scales. */}
      <mesh geometry={glassGeometry} frustumCulled={false}>
        {/* samples and resolution are the two costs that matter here — this
            material re-renders the whole scene into a buffer every frame.
            Roughness is up from 0.04: a mirror-smooth tube returns the key as a
            pinpoint that the eye reads as a speck rather than as a surface. A
            little roughness spreads it into the travelling streak the form
            wants, and the clearcoat puts a crisp edge back on top of it. */}
        <MeshTransmissionMaterial
          samples={4}
          resolution={resolution}
          transmission={1}
          roughness={roughness}
          thickness={0.22}
          ior={1.28}
          clearcoat={clearcoat}
          clearcoatRoughness={0.12}
          chromaticAberration={0.1}
          anisotropicBlur={0.06}
          distortion={0.02}
          temporalDistortion={0.02}
          backside={false}
        />
      </mesh>
    </>
  )
}
