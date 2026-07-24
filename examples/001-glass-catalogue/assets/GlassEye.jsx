import { useRef } from 'react'
import { Lightformer, MeshTransmissionMaterial } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { Iris } from './Iris.jsx'

// Circular, because a rectangular lightformer reflects as a literal grey
// rectangle on a sphere and instantly reads as CG. Round catchlights are most
// of what makes an eye look wet.
export function EyeLights() {
  const { catchlight, ambient } = useControls('eye · catchlight', {
    catchlight: { value: 9, min: 0, max: 40, step: 0.5 },
    ambient: { value: 1.15, min: 0, max: 4, step: 0.05 },
  })

  return (
    <>
      {/* The hard specular. One dominant, one smaller opposite — two is enough
          to imply a room; three starts to look like a product shot. */}
      <Lightformer form="circle" intensity={catchlight} position={[-2, 2.6, 3]} scale={0.6} />
      <Lightformer form="circle" intensity={catchlight * 0.35} position={[2.4, -1.4, 2.6]} scale={0.35} />

      {/* Big and soft, so the orb has volume instead of just two hot dots */}
      <Lightformer form="circle" intensity={ambient} position={[0, 0, 6]} scale={9} />
      <Lightformer form="ring" intensity={ambient * 0.8} position={[0, 0, -5]} scale={6} />
    </>
  )
}

// An eye with no model in it. A sphere, a disc, a torus, and ~200 instanced
// boxes — the orb's refraction is what sells it, magnifying and bending the
// fibres behind it the way real glass would.
export function GlassEye() {
  const group = useRef()

  const { gaze, drift } = useControls('eye', {
    gaze: { value: 0.28, min: 0, max: 1.2, step: 0.01 },
    drift: { value: 0.35, min: 0, max: 2, step: 0.01 },
  })

  const iris = useControls('eye · iris', {
    color: '#3f9fc4',
    backing: '#0b1e2b',
    limbal: '#03070b',
    radius: { value: 0.46, min: 0.1, max: 0.8, step: 0.01 },
    pupil: { value: 0.16, min: 0.03, max: 0.4, step: 0.005 },
    fibreCount: { value: 260, min: 24, max: 600, step: 2 },
    spread: { value: 0.38, min: 0, max: 0.9, step: 0.01 },
    emissive: { value: 0.75, min: 0, max: 6, step: 0.05 },
    glow: { value: 0.5, min: 0, max: 3, step: 0.01 },
    seed: { value: 7, min: 1, max: 999, step: 1 },
  })

  const orb = useControls('eye · orb', {
    color: '#ffffff',
    roughness: { value: 0.02, min: 0, max: 1, step: 0.01 },
    // Thin. A thick sphere over a dark interior absorbs everything and the
    // whole asset goes black.
    thickness: { value: 0.9, min: 0, max: 6, step: 0.05 },
    ior: { value: 1.52, min: 1, max: 2.33, step: 0.01 },
    chromaticAberration: { value: 0.22, min: 0, max: 1, step: 0.01 },
    anisotropicBlur: { value: 0.1, min: 0, max: 2, step: 0.01 },
    distortion: { value: 0.05, min: 0, max: 2, step: 0.01 },
    distortionScale: { value: 0.3, min: 0, max: 2, step: 0.01 },
    temporalDistortion: { value: 0.02, min: 0, max: 1, step: 0.01 },
    backside: false,
  })

  // Two frequencies that don't divide evenly, so the look never repeats on a
  // beat you can count. Stillness is what makes a rendered eye feel dead.
  useFrame((state) => {
    if (!group.current) return

    const t = state.clock.elapsedTime * drift

    group.current.rotation.y = Math.sin(t) * gaze
    group.current.rotation.x = Math.sin(t * 0.63 + 1.4) * gaze * 0.45
  })

  return (
    <group ref={group}>
      <Iris {...iris} />

      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        <MeshTransmissionMaterial samples={6} resolution={512} transmission={1} {...orb} />
      </mesh>
    </group>
  )
}
