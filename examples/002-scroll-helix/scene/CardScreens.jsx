import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// What is behind the glass, and the light it throws forward through it.
//
// Two pieces that only make sense together:
//
//   screens — a plane behind each panel showing the footage. It is never drawn
//             sharp. The panel in front of it is already frosted, and the
//             transmission pass blurs whatever sits behind it, so the diffusion
//             is the material doing its job rather than an effect applied to the
//             video. Setting it back further makes it more distant.
//
//   shafts  — a frustum in front of each panel, additive, coloured by the
//             average colour of the footage right now. This is the part that
//             makes the panel read as lit from behind rather than as a picture
//             hanging in space.
//
// ONE video element feeds every panel. Five decoders for five panels is the
// obvious build and it is also the one that melts a laptop; each panel takes a
// different crop of the same frame instead, which costs nothing and stops them
// looking like five copies of one thing.

// The shafts fade out as the camera leaves a card behind, the same way its label
// does. Without it every panel in the scene sprays light across the frame at
// once and the effect stops meaning "this one, here".
const FADE_GLSL = /* glsl */ `
  uniform float uCameraX;
  uniform float uFadeNear;
  uniform float uFadeFar;

  attribute vec3 aCenter;

  float proximity() {
    float d = abs(aCenter.x - uCameraX);
    return 1.0 - smoothstep(uFadeNear, uFadeFar, d);
  }
`

const SCREEN_VERTEX = /* glsl */ `
  ${FADE_GLSL}

  varying vec2 vUv;
  varying float vFade;

  void main() {
    vUv = uv;
    vFade = proximity();

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SCREEN_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uDesaturate;
  uniform vec3 uTint;

  varying vec2 vUv;
  varying float vFade;

  void main() {
    vec3 c = texture2D(uMap, vUv).rgb;

    // Distance reads as loss of colour before it reads as loss of light, which
    // is why a desaturate does more for "far away" here than dimming does.
    float grey = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(grey), uDesaturate) * uTint;

    gl_FragColor = vec4(c, uOpacity * vFade);
  }
`

const SHAFT_VERTEX = /* glsl */ `
  ${FADE_GLSL}

  attribute float aT;
  attribute vec2 aEdge;

  varying float vT;
  varying float vFade;
  varying vec2 vEdge;

  void main() {
    vT = aT;
    vEdge = aEdge;
    vFade = proximity();

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SHAFT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uSoftness;
  uniform float uTime;
  uniform float uRayFreq;
  uniform float uRayDepth;

  varying float vT;
  varying float vFade;
  varying vec2 vEdge;

  void main() {
    // Soft at the sides. The first version leaned on a rim term — alpha rising
    // where the surface turns edge-on — which is right for a shell standing in
    // for an atmosphere and wrong for a beam: it puts maximum brightness exactly
    // along the silhouette, so a hollow frustum draws you a picture of its own
    // outline. Two hard diagonals across the frame, unmistakably geometry.
    //
    // This is a stack of slices instead, and the edge fade is explicit rather
    // than inferred from the viewing angle.
    float edge = (1.0 - smoothstep(0.55, 1.0, abs(vEdge.x)))
               * (1.0 - smoothstep(0.55, 1.0, abs(vEdge.y)));
    edge = pow(edge, uSoftness);

    // Falls off along its length and never reaches the far end — a beam with a
    // visible end is a cone, not a shaft.
    float along = pow(1.0 - vT, 1.7);

    // Striation, which is the whole difference between a beam and a wash. Light
    // through a window only reads as rays because something breaks the source
    // up — mullions, branches, a gap. A plain rectangle emits an even glow, and
    // the even glow is exactly what the previous version looked like. Two
    // incommensurate frequencies so the bands do not come out as wallpaper.
    float band = sin(vEdge.x * uRayFreq) * 0.5 + 0.5;
    band *= sin(vEdge.x * uRayFreq * 0.37 + 1.7) * 0.5 + 0.5;
    band = mix(1.0, 0.25 + 1.35 * band, uRayDepth);

    // Slow drift so the beam breathes instead of sitting there like geometry.
    float drift = 0.86 + 0.14 * sin(uTime * 0.7 + vT * 5.0);

    gl_FragColor = vec4(uColor, edge * along * band * drift * uIntensity * vFade);
  }
`

// The beam as a stack of soft slices marching along its axis, growing and
// dimming. Every slice lies in the XY plane, which in this scene IS facing the
// camera — the camera travels along X but never turns, so a fixed facing is the
// same thing as billboarding and costs nothing per frame.
//
// Enough slices at low alpha and the stack stops reading as slices. The rake is
// what makes it legible: a beam aimed straight down the barrel of the lens is a
// rectangle, and only an angled one crosses the frame like light does.
const SLICES = 22

function shaftGeometry(width, height, length, spread, dir) {
  const positions = []
  const ts = []
  const edges = []

  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]

  for (let i = 0; i < SLICES; i += 1) {
    const t = i / (SLICES - 1)
    const scale = 1 + (spread - 1) * t
    const hw = (width / 2) * scale
    const hh = (height / 2) * scale

    const centre = new THREE.Vector3().addScaledVector(dir, length * t)
    const at = (c) => [centre.x + corners[c][0] * hw, centre.y + corners[c][1] * hh, centre.z]

    for (const [a, b, c] of [
      [0, 1, 2],
      [0, 2, 3],
    ]) {
      positions.push(...at(a), ...at(b), ...at(c))
      edges.push(...corners[a], ...corners[b], ...corners[c])
      ts.push(t, t, t)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1))
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 2))

  return geo
}

function withCentre(geo, centre) {
  const count = geo.attributes.position.count
  const centres = new Float32Array(count * 3)

  for (let i = 0; i < count; i += 1) {
    centres[i * 3] = centre[0]
    centres[i * 3 + 1] = centre[1]
    centres[i * 3 + 2] = centre[2]
  }

  geo.setAttribute('aCenter', new THREE.BufferAttribute(centres, 3))

  return geo
}

export function CardScreens({
  positions,
  src,
  width,
  height,
  panelZ,
  panelDepth,
  bevel,
  setback,
  inset,
  opacity,
  desaturate,
  tint,
  shafts,
  shaftLength,
  shaftSpread,
  shaftSoftness,
  rayFreq,
  rayDepth,
  rake,
  direction,
  fadeNear,
  fadeFar,
}) {
  const screenMaterial = useRef()
  const shaftMaterial = useRef()
  const clock = useRef(0)
  const sampleAt = useRef(0)

  // One element, one decode, every panel. Muted and inline because no browser
  // will autoplay otherwise, and a panel that needs a click to light up is a
  // panel that is dark in the only screenshot anyone sees.
  const video = useMemo(() => {
    const el = document.createElement('video')

    el.src = src
    el.loop = true
    el.muted = true
    el.defaultMuted = true
    el.playsInline = true
    el.autoplay = true
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'

    // Parked in the document rather than left detached. A detached element
    // decodes in some browsers and quietly does not in others, and display:none
    // is worse — it is a documented reason to stop decoding altogether. One
    // pixel, clipped, out of the way, and still a real element that can be
    // inspected when it misbehaves.
    el.setAttribute('data-panel-loop', '')
    Object.assign(el.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
      left: '0',
      top: '0',
      })
    document.body.appendChild(el)

    return el
  }, [src])

  const texture = useMemo(() => {
    const t = new THREE.VideoTexture(video)
    t.colorSpace = THREE.SRGBColorSpace
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.generateMipmaps = false

    return t
  }, [video])

  useEffect(() => {
    const attempt = () => video.play().catch(() => {})

    attempt()

    // Autoplay can still be refused. If it is, the first thing the visitor does
    // starts it, and they never learn it was ever not playing.
    const options = { once: true, passive: true }
    window.addEventListener('pointerdown', attempt, options)
    window.addEventListener('wheel', attempt, options)
    window.addEventListener('keydown', attempt, { once: true })

    return () => {
      window.removeEventListener('pointerdown', attempt)
      window.removeEventListener('wheel', attempt)
      window.removeEventListener('keydown', attempt)
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
    }
  }, [video])

  useEffect(() => () => texture.dispose(), [texture])

  // A 1x1 canvas is a legitimate average-colour sampler: the browser's own
  // downscale does the averaging, in C, for free.
  const sampler = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1

    return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) }
  }, [])

  const front = panelZ + panelDepth / 2 + bevel

  const screenGeometry = useMemo(() => {
    const parts = positions.map((position, index) => {
      const geo = new THREE.PlaneGeometry(width * inset, height * inset)

      // Each panel takes a different crop, so one clip does not read as five
      // copies of itself.
      const uv = geo.attributes.uv
      const scale = 0.62
      const ox = (index % 3) * 0.19
      const oy = (index % 2) * 0.24

      for (let i = 0; i < uv.count; i += 1) {
        uv.setXY(i, uv.getX(i) * scale + ox, uv.getY(i) * scale + oy)
      }

      geo.translate(position[0], position[1], panelZ - panelDepth / 2 - bevel - setback)

      return withCentre(geo, position)
    })

    const merged = mergeGeometries(parts)
    parts.forEach((part) => part.dispose())

    return merged
  }, [positions, width, height, inset, panelZ, panelDepth, bevel, setback])

  const shaftGeo = useMemo(() => {
    // Light leaves a window travelling away from the source that lit it. The
    // scene's key is overhead, so the beams rake downward as they come forward —
    // which is also the only reason they are visible at all. A beam aimed
    // straight at the camera is a rectangle.
    const dir = new THREE.Vector3(0, 0, 1)
      .addScaledVector(direction.clone().negate(), rake)
      .normalize()

    const parts = positions.map((position) => {
      const geo = shaftGeometry(width, height, shaftLength, shaftSpread, dir)
      geo.translate(position[0], position[1], front)

      return withCentre(geo, position)
    })

    const merged = mergeGeometries(parts)
    parts.forEach((part) => part.dispose())

    return merged
  }, [positions, width, height, shaftLength, shaftSpread, rake, direction, front])

  useEffect(() => () => screenGeometry.dispose(), [screenGeometry])
  useEffect(() => () => shaftGeo.dispose(), [shaftGeo])

  const screenUniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uOpacity: { value: opacity },
      uDesaturate: { value: desaturate },
      uTint: { value: new THREE.Color(tint) },
      uCameraX: { value: 0 },
      uFadeNear: { value: fadeNear },
      uFadeFar: { value: fadeFar },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texture],
  )

  const shaftUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#8fa6d8') },
      uIntensity: { value: shafts },
      uSoftness: { value: shaftSoftness },
      uRayFreq: { value: rayFreq },
      uRayDepth: { value: rayDepth },
      uTime: { value: 0 },
      uCameraX: { value: 0 },
      uFadeNear: { value: fadeNear },
      uFadeFar: { value: fadeFar },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useFrame(({ camera }, delta) => {
    clock.current += delta

    if (screenMaterial.current) {
      const u = screenMaterial.current.uniforms
      u.uOpacity.value = opacity
      u.uDesaturate.value = desaturate
      u.uTint.value.set(tint)
      u.uCameraX.value = camera.position.x
      u.uFadeNear.value = fadeNear
      u.uFadeFar.value = fadeFar
    }

    if (!shaftMaterial.current) return

    const u = shaftMaterial.current.uniforms
    u.uIntensity.value = shafts
    u.uSoftness.value = shaftSoftness
    u.uRayFreq.value = rayFreq
    u.uRayDepth.value = rayDepth
    u.uTime.value = clock.current
    u.uCameraX.value = camera.position.x
    u.uFadeNear.value = fadeNear
    u.uFadeFar.value = fadeFar

    // Six times a second is plenty. The beam colour follows what the footage is
    // doing, and nobody can see it resolve faster than that through frosted
    // glass.
    sampleAt.current -= delta
    if (sampleAt.current > 0) return
    sampleAt.current = 1 / 6

    if (video.readyState < 2) return

    try {
      sampler.ctx.drawImage(video, 0, 0, 1, 1)
      const [r, g, b] = sampler.ctx.getImageData(0, 0, 1, 1).data

      u.uColor.value.setRGB((r / 255) ** 0.7, (g / 255) ** 0.7, (b / 255) ** 0.7)
    } catch {
      // A tainted canvas would throw here. The beam keeps its last colour, which
      // is a better outcome than the frame dying over a light.
    }
  })

  return (
    <>
      {/* Behind the glass. depthWrite off so the panel in front composites over
          it cleanly through the transmission pass. */}
      <mesh geometry={screenGeometry} frustumCulled={false} renderOrder={-1}>
        <shaderMaterial
          ref={screenMaterial}
          uniforms={screenUniforms}
          vertexShader={SCREEN_VERTEX}
          fragmentShader={SCREEN_FRAGMENT}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* In front of the glass, and additive — light adds, it does not cover.
          Double-sided because you are meant to be standing inside the beam. */}
      <mesh geometry={shaftGeo} frustumCulled={false}>
        <shaderMaterial
          ref={shaftMaterial}
          uniforms={shaftUniforms}
          vertexShader={SHAFT_VERTEX}
          fragmentShader={SHAFT_FRAGMENT}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  )
}
