import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { Environment, Stats } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Leva, useControls } from 'leva'
import { HelixLights, HelixTube } from './scene/HelixTube.jsx'
import { HelixParticles } from './scene/HelixParticles.jsx'
import { DustVeil } from './scene/DustVeil.jsx'
import { HexPlates } from './scene/HexPlates.jsx'
import { CardPanels } from './scene/CardPanels.jsx'
import { CardScreens } from './scene/CardScreens.jsx'
import { ScrollRig } from './scene/ScrollRig.jsx'
import { KEY, useLightDirection } from './scene/lighting.js'
import { AdaptiveQuality } from './scene/AdaptiveQuality.jsx'
import { useScrollProgress } from './scene/useScrollProgress.js'
import './style.css'

// The helix runs well past the camera's travel at both ends, so its termini are
// never in frame. Nothing whole is ever visible, so nothing can be cropped wrong.
const LENGTH = 60
const TRAVEL = 42
const TURNS = 17

// Stand-ins for real navigation. Only x and which side they sit on are fixed
// here — the actual world position is derived below, so the glass panel and the
// DOM anchor are placed from one calculation and cannot drift apart.
// One loop per card. Cut from the Blender Foundation's open movies (CC BY 3.0) —
// see public/media/ATTRIBUTION.md. Placeholders for a study, not final content.
const LOOPS = [
  'loop-01.mp4',
  'loop-02.mp4',
  'loop-03.mp4',
  'loop-04.mp4',
  'loop-05.mp4',
]

const CARDS = [
  { label: 'Index', meta: '00', href: '../../', x: -17, side: 1 },
  { label: 'Catalogue', meta: '01', href: '../001-glass-catalogue/', x: -8, side: -1 },
  { label: 'Source', meta: '02', href: 'https://github.com/Elifterminal/ATexamples', x: 1, side: 1 },
  { label: 'Asset log', meta: '03', href: '../../log/', x: 10, side: -1 },
  { label: 'Readme', meta: '04', href: 'https://github.com/Elifterminal/ATexamples#readme', x: 18, side: 1 },
]

function Scene({ scroll, cardRefs }) {
  // One light, agreed on by everything in the frame. Elevation and azimuth in
  // degrees because those are the two worth dragging; 90 is straight overhead.
  // The scene was previously lit four separate ways, which is why it read flat —
  // the environment, the core and both particle systems each had their own idea
  // of where the light was, and the average of four disagreeing lights is no
  // light at all.
  const light = useControls('light', {
    elevation: { value: 66, min: 0, max: 90, step: 1 },
    azimuth: { value: 18, min: -180, max: 180, step: 1 },
    key: { value: 7, min: 0, max: 25, step: 0.1 },
    lamp: { value: 2.4, min: 0, max: 10, step: 0.05 },
    bounce: { value: 0.35, min: 0, max: 4, step: 0.05 },
    ambient: { value: 0.16, min: 0, max: 1, step: 0.01 },
    contrast: { value: 1.9, min: 0.4, max: 6, step: 0.05 },
    roughness: { value: 0.1, min: 0.01, max: 0.6, step: 0.005 },
    clearcoat: { value: 0.65, min: 0, max: 1, step: 0.01 },
  })

  const direction = useLightDirection(light.elevation, light.azimuth)

  const form = useControls('helix', {
    radius: { value: 1.15, min: 0.2, max: 4, step: 0.05 },
    tube: { value: 0.3, min: 0.02, max: 0.9, step: 0.005 },
    visibleWidth: { value: 11, min: 4, max: 30, step: 0.5 },
    // Breathing room kept around whatever has to stay in frame. The rim glow and
    // the bloom spread past the geometry, so fitting the panels exactly still
    // reads as clipped.
    margin: { value: 0.45, min: 0, max: 3, step: 0.05 },
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

  // Built as smoke, came out as fine dust, so it is dust now — discrete motes
  // that catch the light individually rather than a continuous haze.
  // inner and shell are multiples of the glass's outer surface (radius + tube),
  // not world units, so the veil keeps its clearance when either of those
  // sliders moves instead of being swallowed by the form. inner 1.0 sits exactly
  // on the glass; the sheath spans inner → inner + shell.
  const dust = useControls('dust', {
    count: { value: 40000, min: 0, max: 120000, step: 500 },
    colour: '#9db4d6',
    // Below about 1.4 here the points land under a pixel, clamp to a hard dot,
    // and the soft falloff in the fragment shader never gets to run — the veil
    // reads as a starfield rather than as motes. Small means small against the form,
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

  // A mote glints when its facet lines up with the light. `fraction` is how many
  // motes are reflective at all, `tightness` how narrowly aligned they must be,
  // `rate` how often each one fires. Low fraction with high tightness reads as
  // real specks catching the light; high fraction with low tightness reads as
  // the whole field blinking.
  const glint = useControls('sparkle', {
    sparkle: { value: 0.85, min: 0, max: 4, step: 0.01 },
    fraction: { value: 0.14, min: 0, max: 1, step: 0.01 },
    rate: { value: 1.5, min: 0.1, max: 8, step: 0.05 },
    tightness: { value: 18, min: 1, max: 80, step: 1 },
  })

  // The panels sit in FRONT of the form (positive z) and overlap it vertically
  // without covering it — lift is small enough that the helix reads through and
  // around the glass rather than being hidden by it. The flakes orbit out to
  // ~3.9, well past the panel face, so they cross in front of it now and then.
  const card = useControls('cards', {
    width: { value: 3.6, min: 0.8, max: 9, step: 0.05 },
    height: { value: 2.1, min: 0.4, max: 6, step: 0.05 },
    lift: { value: 1.35, min: 0, max: 5, step: 0.05 },
    z: { value: 1.75, min: -2, max: 5, step: 0.05 },
    depth: { value: 0.16, min: 0.01, max: 1, step: 0.005 },
    radius: { value: 0.22, min: 0, max: 1.2, step: 0.01 },
    bevel: { value: 0.035, min: 0, max: 0.2, step: 0.005 },
    ior: { value: 1.42, min: 1, max: 2.4, step: 0.01 },
    roughness: { value: 0.28, min: 0, max: 1, step: 0.005 },
    transmission: { value: 0.92, min: 0, max: 1, step: 0.01 },
    rim: { value: 0.035, min: 0, max: 0.3, step: 0.005 },
    rimGlow: { value: 0.75, min: 0, max: 3, step: 0.01 },
    thickness: { value: 0.5, min: 0, max: 4, step: 0.01 },
    chroma: { value: 0.18, min: 0, max: 1, step: 0.01 },
    distortion: { value: 0.12, min: 0, max: 1, step: 0.01 },
    tint: '#9fc4ff',
    grain: { value: 0.35, min: 0, max: 1, step: 0.01 },
    grainScale: { value: 3, min: 0.25, max: 12, step: 0.25 },
    panelRes: { value: 256, options: { '128 (cheapest)': 128, 256: 256, 512: 512 } },
  })

  // What plays behind the glass, and the light it throws forward through it.
  // The footage is never drawn sharp — the panel in front is already frosted and
  // the transmission pass blurs whatever is behind it, so `setback` is the knob
  // that says how far away the thing appears to be.
  //
  // Keep setback small enough that the screen stays outside the helix: the form
  // reaches 1.45 from the axis in any direction, so the plane must sit in front
  // of that or it will poke through the tube.
  const screen = useControls('screens', {
    play: true,
    // Additive is what makes them see-through: a dark part of a frame adds
    // nothing, so the helix and the dust read straight through it. Normal
    // blending is the honest television, kept for comparison.
    // Normal by default. Additive sounded like the answer to "see through them"
    // and it is, for the dark end — but a bright frame then saturates, the bloom
    // pass finds it, and the panel becomes a light box with no picture in it.
    // Normal blending at less than full opacity is see-through everywhere and
    // still has an image. Additive is kept for the holographic read.
    blend: { value: 'normal', options: { 'normal (image survives)': 'normal', 'additive (glows, blows out)': 'additive' } },
    setback: { value: 0.1, min: 0.01, max: 1.5, step: 0.01 },
    inset: { value: 0.88, min: 0.2, max: 1, step: 0.01 },
    opacity: { value: 0.82, min: 0, max: 2, step: 0.01 },
    lumaKey: { value: 0.3, min: 0, max: 1, step: 0.01 },
    desaturate: { value: 0.28, min: 0, max: 1, step: 0.01 },
    tint: '#b9ccff',
    // Wider than the fade, so a panel is already running by the time you can
    // see it. Only cards inside this radius decode at all.
    radius: { value: 16, min: 2, max: 60, step: 1 },
    beams: { value: 0.17, min: 0, max: 2, step: 0.005 },
    beamLength: { value: 9, min: 0.5, max: 30, step: 0.1 },
    beamSpread: { value: 3.2, min: 1, max: 8, step: 0.05 },
    beamSoftness: { value: 1.4, min: 0.2, max: 8, step: 0.1 },
    rayFreq: { value: 9, min: 0, max: 40, step: 0.5 },
    rayDepth: { value: 0.7, min: 0, max: 1, step: 0.01 },
    rake: { value: 1.15, min: 0, max: 2, step: 0.01 },
    fadeNear: { value: 4, min: 0.5, max: 30, step: 0.5 },
    fadeFar: { value: 11, min: 1, max: 40, step: 0.5 },
  })

  // One calculation, two consumers: the glass and the DOM anchors.
  const placed = useMemo(
    () => CARDS.map((c) => ({ ...c, position: [c.x, c.side * card.lift, card.z] })),
    [card.lift, card.z],
  )

  const positions = useMemo(() => placed.map((c) => c.position), [placed])

  // Everything that has to stay in frame, and how far forward each piece sits.
  // Depth matters as much as size here: the panels are both the tallest content
  // and the closest, so they are what the framing is really solving for.
  const content = useMemo(
    () => [
      { reach: form.radius + form.tube, depth: 0 },
      { reach: card.lift + card.height / 2, depth: card.z },
    ],
    [form.radius, form.tube, card.lift, card.height, card.z],
  )

  // Rare, much larger, and the only thing in the sheath with a face. They ride
  // the identical orbit as the dust — shared code, not a second copy — but a
  // plate can turn, and turning is what lets it catch the light and then vanish
  // edge-on. Keep `count` low: the whole point is that they're uncommon.
  const hex = useControls('hex', {
    count: { value: 380, min: 0, max: 2000, step: 10 },
    size: { value: 0.3, min: 0.02, max: 1.5, step: 0.005 },
    opacity: { value: 0.5, min: 0, max: 2, step: 0.01 },
    base: '#7f93b8',
    inner: { value: 1.2, min: 1, max: 6, step: 0.02 },
    shell: { value: 1.5, min: 0.05, max: 8, step: 0.05 },
    tumble: { value: 0.35, min: 0, max: 4, step: 0.01 },
    flutter: { value: 0.55, min: 0, max: 3, step: 0.01 },
    shine: { value: 2.2, min: 0, max: 6, step: 0.02 },
    shineTightness: { value: 7, min: 1, max: 120, step: 1 },
    iridSpread: { value: 1.5, min: 0, max: 3, step: 0.01 },
    iridShift: { value: 0.1, min: 0, max: 1, step: 0.01 },
    // How much colour a plate carries when it ISN'T catching the light. At 0 the
    // field sits grey between flashes; at 1 it's iridescent throughout and the
    // flash only adds brightness.
    iridBase: { value: 0.8, min: 0, max: 1, step: 0.01 },
  })

  return (
    <>
      <ScrollRig
        scroll={scroll}
        travel={TRAVEL}
        visibleWidth={form.visibleWidth}
        damping={form.damping}
        content={content}
        margin={form.margin}
        cards={placed}
        cardRefs={cardRefs}
      />

      <Environment resolution={256}>
        <HelixLights span={26} direction={direction} keyIntensity={light.key} bounce={light.bounce} />
      </Environment>

      {/* The environment gives the glass something to reflect; this gives it a
          highlight with a position. Reflection alone moves with the surface but
          never says where the source is — the lamp is what makes the top of the
          tube read as the top. */}
      <directionalLight
        position={[direction.x * 12, direction.y * 12, direction.z * 12]}
        intensity={light.lamp}
        color={KEY}
      />

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
        direction={direction}
        ambient={light.ambient}
        roughness={light.roughness}
        clearcoat={light.clearcoat}
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
        direction={direction}
        ambient={light.ambient}
        contrast={light.contrast}
      />

      <DustVeil
        count={dust.count}
        span={LENGTH}
        radius={form.radius}
        tube={form.tube}
        inner={dust.inner}
        shell={dust.shell}
        counter={dust.counter}
        colour={dust.colour}
        opacity={dust.opacity}
        size={dust.size}
        orbit={dust.orbit}
        orbitSurge={dust.orbitSurge}
        follow={dust.follow}
        turbulence={dust.turbulence}
        billow={dust.billow}
        wander={dust.wander}
        settle={dust.settle}
        scroll={scroll}
        direction={direction}
        ambient={light.ambient}
        contrast={light.contrast}
        sparkle={glint.sparkle}
        sparkleFraction={glint.fraction}
        sparkleRate={glint.rate}
        sparkleTightness={glint.tightness}
      />

      <HexPlates
        count={hex.count}
        span={LENGTH}
        radius={form.radius}
        tube={form.tube}
        inner={hex.inner}
        shell={hex.shell}
        counter={dust.counter}
        size={hex.size}
        opacity={hex.opacity}
        base={hex.base}
        orbit={dust.orbit}
        orbitSurge={dust.orbitSurge}
        follow={dust.follow}
        turbulence={dust.turbulence}
        billow={dust.billow}
        wander={dust.wander}
        settle={dust.settle}
        tumble={hex.tumble}
        flutter={hex.flutter}
        shine={hex.shine}
        shineTightness={hex.shineTightness}
        iridSpread={hex.iridSpread}
        iridShift={hex.iridShift}
        iridBase={hex.iridBase}
        scroll={scroll}
        direction={direction}
        ambient={light.ambient}
        contrast={light.contrast}
      />

      {screen.play ? (
        <CardScreens
          positions={positions}
          base={import.meta.env.BASE_URL}
          sources={LOOPS}
          play={screen.play}
          blend={screen.blend}
          radius={screen.radius}
          lumaKey={screen.lumaKey}
          width={card.width}
          height={card.height}
          panelZ={card.z}
          panelDepth={card.depth}
          bevel={card.bevel}
          setback={screen.setback}
          inset={screen.inset}
          opacity={screen.opacity}
          desaturate={screen.desaturate}
          tint={screen.tint}
          beams={screen.beams}
          beamLength={screen.beamLength}
          beamSpread={screen.beamSpread}
          beamSoftness={screen.beamSoftness}
          rayFreq={screen.rayFreq}
          rayDepth={screen.rayDepth}
          rake={screen.rake}
          direction={direction}
          fadeNear={screen.fadeNear}
          fadeFar={screen.fadeFar}
        />
      ) : null}

      <CardPanels
        positions={positions}
        width={card.width}
        height={card.height}
        depth={card.depth}
        radius={card.radius}
        bevel={card.bevel}
        resolution={card.panelRes}
        ior={card.ior}
        roughness={card.roughness}
        transmission={card.transmission}
        rim={card.rim}
        rimGlow={card.rimGlow}
        thickness={card.thickness}
        chroma={card.chroma}
        distortion={card.distortion}
        tint={card.tint}
        grain={card.grain}
        grainScale={card.grainScale}
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

// The tuning panel is for building this, not for looking at it. It stays put
// while developing and disappears once it is published, so someone arriving at
// the page is met by the piece rather than by its controls. ?tune brings it back
// on the live page when the sliders are actually wanted there.
const TUNING =
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('tune')

function App() {
  const scroller = useRef(null)
  const cardRefs = useRef([])
  const scroll = useRef({ target: 0, current: 0, velocity: 0 })
  const [dpr, setDpr] = useState(1.25)
  const [nudged, setNudged] = useState(false)

  useScrollProgress(scroller, scroll)

  // Nothing on screen says the page moves sideways, and a visitor who does not
  // discover that sees a still picture and leaves. The hint goes the moment they
  // touch anything, so it never becomes furniture for someone who already knows.
  useEffect(() => {
    const dismiss = () => setNudged(true)
    const options = { once: true, passive: true }

    window.addEventListener('wheel', dismiss, options)
    window.addEventListener('touchstart', dismiss, options)
    window.addEventListener('keydown', dismiss, { once: true })

    const timer = setTimeout(dismiss, 7000)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('wheel', dismiss)
      window.removeEventListener('touchstart', dismiss)
      window.removeEventListener('keydown', dismiss)
    }
  }, [])

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

      <div className={`nudge${nudged ? ' nudge-gone' : ''}`} aria-hidden="true">
        <span className="nudge-arrow">→</span>
        scroll to move through it
      </div>

      <Leva titleBar={{ title: '002 · scroll helix' }} collapsed hidden={!TUNING} />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
