import { useRef } from 'react'
import { MeshTransmissionMaterial } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'

const SHAPES = {
  'torus knot': 'torusKnot',
  icosahedron: 'icosahedron',
  torus: 'torus',
  box: 'box',
}

function Geometry({ shape }) {
  if (shape === 'icosahedron') return <icosahedronGeometry args={[1.3, 0]} />
  if (shape === 'torus') return <torusGeometry args={[1.1, 0.42, 32, 128]} />
  if (shape === 'box') return <boxGeometry args={[1.8, 1.8, 1.8]} />

  // 220 tubular × 32 radial segments. The smoothness is tessellation, and it's
  // free because the form is generated from a formula rather than stored.
  return <torusKnotGeometry args={[1, 0.32, 220, 32]} />
}

export function GlassKnot() {
  const mesh = useRef()

  const { shape, spin } = useControls('knot', {
    shape: { value: 'torusKnot', options: SHAPES },
    spin: { value: 0.15, min: 0, max: 1, step: 0.01 },
  })

  const glass = useControls('knot · glass', {
    color: '#ffffff',
    roughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
    thickness: { value: 1.6, min: 0, max: 6, step: 0.05 },
    ior: { value: 1.42, min: 1, max: 2.33, step: 0.01 },
    chromaticAberration: { value: 0.34, min: 0, max: 1, step: 0.01 },
    anisotropicBlur: { value: 0.2, min: 0, max: 2, step: 0.01 },
    distortion: { value: 0.28, min: 0, max: 2, step: 0.01 },
    distortionScale: { value: 0.4, min: 0, max: 2, step: 0.01 },
    temporalDistortion: { value: 0.12, min: 0, max: 1, step: 0.01 },
    backside: true,
  })

  useFrame((_, delta) => {
    if (!mesh.current) return

    mesh.current.rotation.y += delta * spin
    mesh.current.rotation.x += delta * spin * 0.35
  })

  return (
    <mesh ref={mesh}>
      <Geometry shape={shape} />
      <MeshTransmissionMaterial samples={6} resolution={512} transmission={1} {...glass} />
    </mesh>
  )
}
