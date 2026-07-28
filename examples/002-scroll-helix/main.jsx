import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { Environment, Stats } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Leva, useControls } from 'leva'
import { HelixLights, HelixTube } from './scene/HelixTube.jsx'
import { HelixParticles } from './scene/HelixParticles.jsx'
import { SmokeVeil } from './scene/SmokeVeil.jsx'
import { ScrollRig } from './scene/ScrollRig.jsx'
import { AdaptiveQuality } from './scene/AdaptiveQuality.jsx'
import { useScrollProgress } from './scene/useScrollProgress.js'
import './style.css'

// The helix runs well past the camera's travel at both ends, so its termini are
// never in frame. Nothing whole is ever visible, so nothing can be cropped wrong.
const LENGTH = 60
const TRAVEL = 42
const TURNS = 17

// Stand-ins for real navigation. Placed along the helix; the DOM elements are
// positioned by projecting these world coordinates every frame.
const CARDS = [
  { label: 'Index', meta: '00', href: '../../', position: [-17, 2.3, 0] },
  { label: 'Catalogue', meta: '01', href: '../001-glass-catalogue/', position: [-8, -2.3, 0] },
  { label: 'Source', meta: '02', href: 'https://github.com/Elifterminal/ATexamples', position: [1, 2.3, 0] },
  { label: 'Conventions', meta: '03', href: 'https://github.com/Elifterminal/ATexamples/blob/main/docs/CONVENTIONS.md', position: [10, -2.3, 0] },
  { label: 'Readme', meta: '04', href: 'https://github.com/Elifterminal/ATexamples#readme', position: [18, 2.3, 0] },
]

function Scene({ scroll, cardRefs }) {
  const form = useControls('helix', {
    radius: { value: 1.15, min: 0.2, max: 4, step: 0.05 },
    tube: { value: 0.3, min: 0.02, max: 0.9, step: 0.005 },
    visibleWidth: { value: 11, min: 4, max: 30, step: 0.5 },
    damping: { value: 4.5, min: 0.5, max: 20, step: 0.1 },
  })

  // Every knob in here trades frames for pixels. Defaults are the cheap end;
  // push them up on a machine that can take it.
  const perf = useControls('perf', {
    stats: false,
    transmissionRes: { value: 256, options: { '128 (cheapest)': 128, 256: 256, 512: 512, 1024: 1024 } },
    segmentsPerTurn: { value: 40, min: 8, max: 120, step: 2 },
    multisampling: { value: 2, options: { 'off (fastest)': 0, 2: 2, 4: 4, 8: 8 } },
    bloom: { value: 0.7, min: 0, max: 3, step: 0.05 },
  })

  const flow = useControls('flow', {
    count: { value: 22000, min: 200, max: 60000, step: 100 },
    colour: '#ff2fd0',
    intensity: { value: 1.5, min: 0, max: 10, step: 0.05 },
    size: { value: 0.4, min: 0.1, max: 8, step: 0.05 },
    bore: { value: 0.18, min: 0, max: 0.6, step: 0.005 },
    core: { value: 0.22, min: 0, max: 1.5, step: 0.01 },
    coreScale: { value: 0.66, min: 0.1, max: 1, step: 0.01 },
    drift: { value: 0.012, min: 0, max: 0.2, step: 0.001 },
    surge: { value: 0.9, min: 0, max: 6, step: 0.05 },
  })

  // inner and shell are multiples of the glass's outer surface (radius + tube),
  // not world units, so the veil keeps its clearance when either of those
  // sliders moves instead of being swallowed by the form. inner 1.0 sits exactly
  // on the glass; the sheath spans inner → inner + shell.
  const smoke = useControls('smoke', {
    count: { value: 40000, min: 0, max: 120000, step: 500 },
    colour: '#9db4d6',
    // Below about 1.4 here the points land under a pixel, clamp to a hard dot,
    // and the soft falloff in the fragment shader never gets to run — the veil
    // reads as a starfield instead of smoke. Small means small against the form,
    // not sub-pixel.
    opacity: { value: 0.22, min: 0, max: 1.5, step: 0.005 },
    size: { value: 2.2, min: 0.4, max: 12, step: 0.05 },
    inner: { value: 1.12, min: 1, max: 5, step: 0.02 },
    shell: { value: 0.55, min: 0.05, max: 8, step: 0.05 },
    orbit: { value: 0.35, min: 0, max: 3, step: 0.01 },
    orbitSurge: { value: 2.2, min: 0, max: 12, step: 0.05 },
    follow: { value: 0.4, min: -2, max: 2, step: 0.02 },
    counter: { value: 0.3, min: 0, max: 0.5, step: 0.01 },
    turbulence: { value: 0.9, min: 0, max: 4, step: 0.05 },
    billow: { value: 0.22, min: 0, max: 1, step: 0.01 },
    wander: { value: 0.9, min: 0, max: 6, step: 0.05 },
    settle: { value: 1.6, min: 0.2, max: 10, step: 0.1 },
  })

  return (
    <>
      <ScrollRig
        scroll={scroll}
        travel={TRAVEL}
        visibleWidth={form.visibleWidth}
        damping={form.damping}
        cards={CARDS}
        cardRefs={cardRefs}
      />

      <Environment resolution={256}>
        <HelixLights span={26} />
      </Environment>

      <HelixTube
        radius={form.radius}
        length={LENGTH}
        turns={TURNS}
        tube={form.tube}
        colour={flow.colour}
        core={flow.core}
        coreScale={flow.coreScale}
        resolution={perf.transmissionRes}
        segmentsPerTurn={perf.segmentsPerTurn}
      />

      <HelixParticles
        count={flow.count}
        radius={form.radius}
        length={LENGTH}
        turns={TURNS}
        bore={flow.bore}
        size={flow.size}
        colour={flow.colour}
        intensity={flow.intensity}
        drift={flow.drift}
        surge={flow.surge}
        scroll={scroll}
      />

      <SmokeVeil
        count={smoke.count}
        span={LENGTH}
        radius={form.radius}
        tube={form.tube}
        inner={smoke.inner}
        shell={smoke.shell}
        counter={smoke.counter}
        colour={smoke.colour}
        opacity={smoke.opacity}
        size={smoke.size}
        orbit={smoke.orbit}
        orbitSurge={smoke.orbitSurge}
        follow={smoke.follow}
        turbulence={smoke.turbulence}
        billow={smoke.billow}
        wander={smoke.wander}
        settle={smoke.settle}
        scroll={scroll}
      />

      {/* Default multisampling is 8. Dropping it is one of the largest single
          wins available, and bloom hides much of the aliasing it costs. */}
      <EffectComposer multisampling={perf.multisampling}>
        <Bloom intensity={perf.bloom} luminanceThreshold={0.42} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette darkness={0.65} offset={0.2} />
      </EffectComposer>

      {perf.stats ? <Stats /> : null}
    </>
  )
}

function App() {
  const scroller = useRef(null)
  const cardRefs = useRef([])
  const scroll = useRef({ target: 0, current: 0, velocity: 0 })
  const [dpr, setDpr] = useState(1.25)

  useScrollProgress(scroller, scroll)

  return (
    <>
      <Canvas camera={{ position: [0, 0, 9], fov: 45 }} dpr={dpr} gl={{ antialias: false }}>
        <color attach="background" args={['#07080c']} />
        <AdaptiveQuality onChange={setDpr} />
        <Scene scroll={scroll} cardRefs={cardRefs} />
      </Canvas>

      {/* The scroll surface. Width in viewport units is what makes the journey
          the same length on a phone and an ultrawide. */}
      <div className="scroller" ref={scroller} tabIndex={0} aria-label="Scroll through the helix">
        <div className="scroller-span" />
      </div>

      {/* Real anchors, positioned from world space. Keyboard-navigable, readable
          by a screen reader, and the browser renders the text. */}
      <div className="cards">
        {CARDS.map((card, index) => (
          <a
            key={card.label}
            ref={(el) => {
              cardRefs.current[index] = el
            }}
            className="card"
            href={card.href}
          >
            <span className="card-meta">{card.meta}</span>
            <span className="card-label">{card.label}</span>
          </a>
        ))}
      </div>

      <div className="hud">
        <div className="hud-row">
          <span>002 — scroll helix</span>
          <a href="../../">index</a>
        </div>
        <div className="hud-row hud-bottom">
          <span className="dim">scroll → · wheel, trackpad, arrows, touch</span>
          <span className="dim">dpr {dpr.toFixed(2)} · auto</span>
        </div>
      </div>

      <Leva titleBar={{ title: '002 · scroll helix' }} collapsed />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
