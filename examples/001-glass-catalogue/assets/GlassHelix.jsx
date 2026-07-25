import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Lightformer, MeshTransmissionMaterial } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { HelixCurve } from './helixCurve.js'
import { HelixParticles } from './HelixParticles.jsx'

// Long soft strips running the length of the form. A pipe wants a highlight
// that travels along it — that streak is what tells you it's round and wet.
export function HelixLights() {
  const { key, edge } = useControls('helix · light', {
    key: { value: 4.5, min: 0, max: 20, step: 0.1 },
    edge: { value: 2.2, min: 0, max: 20, step: 0.1 },
  })

  return (
    <>
      <Lightformer intensity={key} position={[0, 3.5, 2]} scale={[14, 0.6, 1]} />
      <Lightformer intensity={edge} position={[0, -3, 1.5]} scale={[14, 0.4, 1]} />
      <Lightformer intensity={edge * 0.7} position={[-5, 0, -4]} scale={[3, 4, 1]} />
      <Lightformer form="circle" intensity={0.5} position={[0, 0, 7]} scale={10} />
    </>
  )
}

export function GlassHelix({ quality }) {
  const group = useRef()

  const { length, radius, turns, tube, spin } = useControls('helix · form', {
    length: { value: 11, min: 3, max: 24, step: 0.25 },
    radius: { value: 1.15, min: 0.2, max: 4, step: 0.05 },
    turns: { value: 3.2, min: 0.5, max: 10, step: 0.1 },
    tube: { value: 0.32, min: 0.02, max: 0.9, step: 0.005 },
    spin: { value: 0.12, min: 0, max: 1.5, step: 0.01 },
  })

  const flow = useControls('helix · flow', {
    count: { value: 12000, min: 200, max: 30000, step: 100 },
    colour: '#ff2fd0',
    intensity: { value: 1.5, min: 0, max: 10, step: 0.05 },
    size: { value: 0.4, min: 0.1, max: 8, step: 0.05 },
    speed: { value: 0.06, min: 0, max: 0.6, step: 0.005 },
    bore: { value: 0.18, min: 0, max: 0.6, step: 0.005 },
    // The luminous body of the fluid. Particles alone read as dust — liquid
    // needs mass, and the points are the detail riding on top of it.
    core: { value: 0.22, min: 0, max: 1.5, step: 0.01 },
    coreScale: { value: 0.66, min: 0.1, max: 1, step: 0.01 },
  })

  const glass = useControls('helix · glass', {
    color: '#ffffff',
    roughness: { value: 0.04, min: 0, max: 1, step: 0.01 },
    thickness: { value: 0.22, min: 0, max: 6, step: 0.05 },
    ior: { value: 1.28, min: 1, max: 2.33, step: 0.01 },
    chromaticAberration: { value: 0.1, min: 0, max: 1, step: 0.01 },
    anisotropicBlur: { value: 0.06, min: 0, max: 2, step: 0.01 },
    distortion: { value: 0.02, min: 0, max: 2, step: 0.01 },
    distortionScale: { value: 0.3, min: 0, max: 2, step: 0.01 },
    temporalDistortion: { value: 0.02, min: 0, max: 1, step: 0.01 },
    backside: false,
  })

  // Both strands merged into ONE geometry so there's a single transmission
  // pass. Two meshes would mean two full-scene re-renders every frame.
  const buildTubes = (tubeRadius) => {
    const strands = [0, Math.PI].map((phase) => {
      const curve = new HelixCurve(radius, length, turns, phase)
      return new THREE.TubeGeometry(curve, Math.round(turns * 120), tubeRadius, 32, false)
    })

    const merged = mergeGeometries(strands)
    strands.forEach((strand) => strand.dispose())

    return merged
  }

  const geometry = useMemo(() => buildTubes(tube), [radius, length, turns, tube])

  const coreGeometry = useMemo(
    () => buildTubes(tube * flow.coreScale),
    [radius, length, turns, tube, flow.coreScale],
  )

  // useMemo replaces the geometry but never frees the old one, so every slider
  // drag leaked a buffer on the GPU until the tab was closed.
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => coreGeometry.dispose(), [coreGeometry])

  useFrame((_, delta) => {
    if (!group.current) return

    group.current.rotation.x += delta * spin
  })

  return (
    <group ref={group}>
      {/* Fluid body, inside the glass. Additive and depth-write off so the
          particles read through it rather than z-fighting against it. */}
      <mesh geometry={coreGeometry}>
        <meshBasicMaterial
          color={flow.colour}
          transparent
          opacity={flow.core}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh geometry={geometry}>
        <MeshTransmissionMaterial
          samples={quality.samples}
          resolution={quality.resolution}
          transmission={1}
          {...glass}
        />
      </mesh>

      <HelixParticles
        count={flow.count}
        radius={radius}
        length={length}
        turns={turns}
        bore={flow.bore}
        size={flow.size}
        speed={flow.speed}
        colour={flow.colour}
        intensity={flow.intensity}
      />
    </group>
  )
}
