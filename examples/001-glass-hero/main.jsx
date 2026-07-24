import { StrictMode, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, MeshTransmissionMaterial } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Leva, useControls } from 'leva'
import './style.css'

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

  return <torusKnotGeometry args={[1, 0.32, 220, 32]} />
}

function GlassForm() {
  const mesh = useRef()

  const { shape, spin } = useControls('form', {
    shape: { value: 'torusKnot', options: SHAPES },
    spin: { value: 0.15, min: 0, max: 1, step: 0.01 },
  })

  // Every one of these is a knob worth having under the eye rather than in a
  // commit message. Snapshot the numbers once they look right.
  const glass = useControls('glass', {
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

// A local light rig. No HDRI fetch, so the page stays self-contained and works
// offline — and the lighting is ours to tune rather than a downloaded preset's.
function LightRig() {
  // Starting low on purpose. Clipped highlights are the fastest way to make
  // glass look cheap — bring these up until it reads, then stop.
  const { keyIntensity, rimIntensity, fill } = useControls('light', {
    keyIntensity: { value: 1.4, min: 0, max: 12, step: 0.1 },
    rimIntensity: { value: 0.9, min: 0, max: 12, step: 0.1 },
    fill: { value: 0.25, min: 0, max: 4, step: 0.05 },
  })

  return (
    <Environment resolution={256}>
      <Lightformer intensity={keyIntensity} position={[0, 4, -6]} scale={[9, 4, 1]} />
      <Lightformer intensity={rimIntensity} position={[-6, 1, 2]} scale={[4, 7, 1]} />
      <Lightformer intensity={rimIntensity * 0.6} position={[6, -2, 3]} scale={[4, 7, 1]} />
      <Lightformer intensity={fill} position={[0, -5, 0]} scale={[10, 5, 1]} />
    </Environment>
  )
}

function Post() {
  const { bloomIntensity, threshold, vignette } = useControls('post', {
    bloomIntensity: { value: 0.5, min: 0, max: 4, step: 0.01 },
    threshold: { value: 0.9, min: 0, max: 1, step: 0.01 },
    vignette: { value: 0.6, min: 0, max: 1.5, step: 0.01 },
  })

  return (
    <EffectComposer>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={threshold}
        luminanceSmoothing={0.3}
        mipmapBlur
      />
      <Vignette darkness={vignette} offset={0.25} />
    </EffectComposer>
  )
}

function Hud() {
  return (
    <div className="hud">
      <div className="hud-row">
        <span>001 — Glass Hero</span>
        <a href="../../">index</a>
      </div>

      <div className="hud-row">
        <h1>One form, lit well.</h1>
        <span className="stack dim">
          <span>transmission</span>
          <span>bloom</span>
          <span>vignette</span>
        </span>
      </div>
    </div>
  )
}

function App() {
  const { background } = useControls('world', { background: '#07080c' })

  return (
    <>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 2]} gl={{ antialias: false }}>
        <color attach="background" args={[background]} />
        <LightRig />
        <GlassForm />
        <Post />
      </Canvas>

      <Hud />
      <Leva titleBar={{ title: '001 · glass hero' }} collapsed />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
