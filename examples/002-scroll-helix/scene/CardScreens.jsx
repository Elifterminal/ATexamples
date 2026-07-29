import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

// What is behind the glass, and the light it throws forward through it.
//
//   screen — a plane behind each panel showing its own loop. It is never drawn
//            sharp and never blurred either: the panel in front is frosted and
//            its transmission pass diffuses whatever sits behind it, so the
//            material does that work and `setback` is the whole distance
//            control. Blending it additively is what lets the scene show
//            through — dark parts of a frame then contribute nothing at all.
//
//   beam   — a stack of soft slices in front of the panel, raked along the
//            scene's own light direction and tinted, six times a second, by the
//            average colour of that panel's footage right now.
//
// One component per card rather than one merged mesh for all five. Each card now
// has its own clip, its own decoder and its own beam colour, and ten draw calls
// is not worth the contortion of packing five video textures into one material.

const FADE_GLSL = /* glsl */ `
  uniform float uCameraX;
  uniform float uCentreX;
  uniform float uFadeNear;
  uniform float uFadeFar;

  float proximity() {
    return 1.0 - smoothstep(uFadeNear, uFadeFar, abs(uCentreX - uCameraX));
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
  uniform float uLumaKey;
  uniform vec3 uTint;

  varying vec2 vUv;
  varying float vFade;

  void main() {
    vec3 c = texture2D(uMap, vUv).rgb;

    // Distance reads as loss of colour before it reads as loss of light, which
    // is why desaturating does more for "far away" here than dimming does.
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(luma), uDesaturate) * uTint;

    // Holding back the dark end is what makes the footage sit IN the scene
    // rather than on top of it. At full key a black frame is a hole you see the
    // helix through, and only the lit parts of the shot survive.
    float a = uOpacity * mix(1.0, smoothstep(0.02, 0.55, luma), uLumaKey);

    gl_FragColor = vec4(c, a * vFade);
  }
`

const BEAM_VERTEX = /* glsl */ `
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

const BEAM_FRAGMENT = /* glsl */ `
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
    // Soft at the sides, stated rather than inferred. The first version used a
    // rim term — alpha rising where a surface turns edge-on — which is right for
    // a shell standing in for an atmosphere and wrong for an open cone: it puts
    // maximum brightness exactly along the silhouette, so it drew two hard
    // diagonals across the frame, a picture of the geometry rather than of light.
    float edge = (1.0 - smoothstep(0.55, 1.0, abs(vEdge.x)))
               * (1.0 - smoothstep(0.55, 1.0, abs(vEdge.y)));
    edge = pow(edge, uSoftness);

    float along = pow(1.0 - vT, 1.7);

    // Striation, which is the whole difference between a beam and a wash. Light
    // through a window only reads as rays because something breaks the source
    // up. Two incommensurate frequencies so the bands are not wallpaper.
    float band = sin(vEdge.x * uRayFreq) * 0.5 + 0.5;
    band *= sin(vEdge.x * uRayFreq * 0.37 + 1.7) * 0.5 + 0.5;
    band = mix(1.0, 0.25 + 1.35 * band, uRayDepth);

    float drift = 0.86 + 0.14 * sin(uTime * 0.7 + vT * 5.0);

    gl_FragColor = vec4(uColor, edge * along * band * drift * uIntensity * vFade);
  }
`

// Enough slices at low alpha and the stack stops reading as slices. Every slice
// lies in the XY plane, which in this scene IS facing the camera — it travels
// along X but never turns, so a fixed facing is billboarding for free.
const SLICES = 22

function beamGeometry(width, height, length, spread, dir) {
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

function CardScreen({ position, src, radius, ...o }) {
  const screenMat = useRef()
  const beamMat = useRef()
  const clock = useRef(0)
  const sampleAt = useRef(0)

  const video = useMemo(() => {
    const el = document.createElement('video')

    el.src = src
    el.loop = true
    el.muted = true
    el.defaultMuted = true
    el.playsInline = true
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'

    el.setAttribute('data-panel-loop', '')
    Object.assign(el.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    })

    return el
  }, [src])

  // Parked in the document rather than left detached. A detached element decodes
  // in some browsers and quietly does not in others, and display:none is a
  // documented reason to stop decoding altogether.
  //
  // The append lives here and not in the useMemo above, which is where it was
  // first written. useMemo is called twice under StrictMode with no cleanup in
  // between, so the first element stayed in the document forever — five cards,
  // ten decoders, exactly the cost this component exists to avoid. A DOM side
  // effect belongs in an effect, where there is a cleanup to pair it with.
  useEffect(() => {
    document.body.appendChild(video)

    return () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
    }
  }, [video])

  const texture = useMemo(() => {
    const t = new THREE.VideoTexture(video)
    t.colorSpace = THREE.SRGBColorSpace
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.generateMipmaps = false

    return t
  }, [video])

  useEffect(() => () => texture.dispose(), [texture])

  const sampler = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1

    return canvas.getContext('2d', { willReadFrequently: true })
  }, [])

  const front = o.panelZ + o.panelDepth / 2 + o.bevel

  const screenGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(o.width * o.inset, o.height * o.inset)
    geo.translate(position[0], position[1], o.panelZ - o.panelDepth / 2 - o.bevel - o.setback)

    return geo
  }, [position, o.width, o.height, o.inset, o.panelZ, o.panelDepth, o.bevel, o.setback])

  const beamGeo = useMemo(() => {
    // Light leaves a window travelling away from whatever lit it. The key here
    // is overhead, so the beam rakes down as it comes forward — which is also
    // the only reason it is visible at all, since a beam aimed straight at the
    // camera is seen down its own axis and has no length to show.
    const dir = new THREE.Vector3(0, 0, 1)
      .addScaledVector(o.direction.clone().negate(), o.rake)
      .normalize()

    const geo = beamGeometry(o.width, o.height, o.beamLength, o.beamSpread, dir)
    geo.translate(position[0], position[1], front)

    return geo
  }, [position, o.width, o.height, o.beamLength, o.beamSpread, o.rake, o.direction, front])

  useEffect(() => () => screenGeometry.dispose(), [screenGeometry])
  useEffect(() => () => beamGeo.dispose(), [beamGeo])

  const screenUniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uOpacity: { value: o.opacity },
      uDesaturate: { value: o.desaturate },
      uLumaKey: { value: o.lumaKey },
      uTint: { value: new THREE.Color(o.tint) },
      uCameraX: { value: 0 },
      uCentreX: { value: position[0] },
      uFadeNear: { value: o.fadeNear },
      uFadeFar: { value: o.fadeFar },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texture],
  )

  const beamUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#8fa6d8') },
      uIntensity: { value: o.beams },
      uSoftness: { value: o.beamSoftness },
      uRayFreq: { value: o.rayFreq },
      uRayDepth: { value: o.rayDepth },
      uTime: { value: 0 },
      uCameraX: { value: 0 },
      uCentreX: { value: position[0] },
      uFadeNear: { value: o.fadeNear },
      uFadeFar: { value: o.fadeFar },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useFrame(({ camera }, delta) => {
    clock.current += delta

    const distance = Math.abs(position[0] - camera.position.x)

    // Five clips means five decoders, which is the version of this that stutters
    // on a laptop. Only cards actually near the camera decode; the rest are
    // paused and cost nothing. The radius is wider than the fade so a panel is
    // already running by the time it becomes visible.
    const shouldPlay = o.play && distance < radius

    if (shouldPlay && video.paused) video.play().catch(() => {})
    else if (!shouldPlay && !video.paused) video.pause()

    if (screenMat.current) {
      const u = screenMat.current.uniforms
      u.uOpacity.value = o.opacity
      u.uDesaturate.value = o.desaturate
      u.uLumaKey.value = o.lumaKey
      u.uTint.value.set(o.tint)
      u.uCameraX.value = camera.position.x
      u.uFadeNear.value = o.fadeNear
      u.uFadeFar.value = o.fadeFar
    }

    if (!beamMat.current) return

    const u = beamMat.current.uniforms
    u.uIntensity.value = o.beams
    u.uSoftness.value = o.beamSoftness
    u.uRayFreq.value = o.rayFreq
    u.uRayDepth.value = o.rayDepth
    u.uTime.value = clock.current
    u.uCameraX.value = camera.position.x
    u.uFadeNear.value = o.fadeNear
    u.uFadeFar.value = o.fadeFar

    sampleAt.current -= delta
    if (sampleAt.current > 0 || !shouldPlay || video.readyState < 2) return
    sampleAt.current = 1 / 6

    try {
      sampler.drawImage(video, 0, 0, 1, 1)
      const [r, g, b] = sampler.getImageData(0, 0, 1, 1).data
      const next = new THREE.Color((r / 255) ** 0.7, (g / 255) ** 0.7, (b / 255) ** 0.7)

      // Eased rather than assigned. Real footage cuts, and a beam that snapped to
      // every new shot would flash the whole scene on each edit.
      u.uColor.value.lerp(next, 0.25)
    } catch {
      // A tainted canvas throws here. The beam keeps its last colour, which beats
      // losing the frame over a light.
    }
  })

  const additive = o.blend === 'additive'

  return (
    <>
      <mesh geometry={screenGeometry} frustumCulled={false} renderOrder={-1}>
        <shaderMaterial
          ref={screenMat}
          uniforms={screenUniforms}
          vertexShader={SCREEN_VERTEX}
          fragmentShader={SCREEN_FRAGMENT}
          transparent
          depthWrite={false}
          toneMapped={false}
          blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
        />
      </mesh>

      <mesh geometry={beamGeo} frustumCulled={false}>
        <shaderMaterial
          ref={beamMat}
          uniforms={beamUniforms}
          vertexShader={BEAM_VERTEX}
          fragmentShader={BEAM_FRAGMENT}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  )
}

export function CardScreens({ positions, sources, base, ...options }) {
  return positions.map((position, index) => (
    <CardScreen
      key={`${position[0]}-${sources[index % sources.length]}`}
      position={position}
      src={`${base}media/${sources[index % sources.length]}`}
      {...options}
    />
  ))
}
