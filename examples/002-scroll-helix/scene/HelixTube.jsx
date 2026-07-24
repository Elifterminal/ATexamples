import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Lightformer, MeshTransmissionMaterial } from '@react-three/drei'
import { HelixCurve } from './helixCurve.js'

// Long soft strips running the length of the form. A pipe wants a highlight that
// travels along it — that streak is what tells you it's round.
export function HelixLights({ span }) {
  return (
    <>
      <Lightformer intensity={4.5} position={[0, 3.5, 2]} scale={[span, 0.6, 1]} />
      <Lightformer intensity={2.2} position={[0, -3, 1.5]} scale={[span, 0.4, 1]} />
      <Lightformer form="circle" intensity={0.5} position={[0, 0, 7]} scale={12} />
    </>
  )
}

export function HelixTube({ radius, length, turns, tube, colour, core, coreScale }) {
  // Both strands merged into one geometry so there's a single transmission pass.
  // Segment density is per-turn, so a longer helix doesn't quietly get coarser.
  const build = (tubeRadius) => {
    const strands = [0, Math.PI].map((phase) => {
      const curve = new HelixCurve(radius, length, turns, phase)
      return new THREE.TubeGeometry(curve, Math.round(turns * 60), tubeRadius, 20, false)
    })

    const merged = mergeGeometries(strands)
    strands.forEach((strand) => strand.dispose())

    return merged
  }

  const glassGeometry = useMemo(() => build(tube), [radius, length, turns, tube])
  const coreGeometry = useMemo(
    () => build(tube * coreScale),
    [radius, length, turns, tube, coreScale],
  )

  return (
    <>
      {/* The fluid's luminous body. Particles alone read as dust. */}
      <mesh geometry={coreGeometry} frustumCulled={false}>
        <meshBasicMaterial
          color={colour}
          transparent
          opacity={core}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Low IOR on purpose — a hard refractive index bends the particles behind
          the wall into diagonal bands that read as scales. */}
      <mesh geometry={glassGeometry} frustumCulled={false}>
        <MeshTransmissionMaterial
          samples={4}
          resolution={512}
          transmission={1}
          roughness={0.04}
          thickness={0.22}
          ior={1.28}
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
