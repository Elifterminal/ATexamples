import { Environment, Lightformer } from '@react-three/drei'
import { useControls } from 'leva'

// The four-panel rig: key behind, two rims, a fill from below. Big rectangles,
// which is exactly right for a form with edges to catch — and exactly wrong for
// a sphere, where they reflect as grey rectangular smudges. Assets that don't
// want it pass `base: false` and supply their own.
//
// Starting low on purpose — clipped highlights are the fastest way to make glass
// look cheap. Bring these up until it reads, then stop.
function BaseFormers({ scope, defaults }) {
  const { key, rim, fill, tint } = useControls(`${scope} · light`, {
    key: { value: defaults.key ?? 1.4, min: 0, max: 12, step: 0.1 },
    rim: { value: defaults.rim ?? 0.9, min: 0, max: 12, step: 0.1 },
    fill: { value: defaults.fill ?? 0.25, min: 0, max: 4, step: 0.05 },
    tint: defaults.tint ?? '#ffffff',
  })

  return (
    <>
      <Lightformer intensity={key} color={tint} position={[0, 4, -6]} scale={[9, 4, 1]} />
      <Lightformer intensity={rim} color={tint} position={[-6, 1, 2]} scale={[4, 7, 1]} />
      <Lightformer intensity={rim * 0.6} color={tint} position={[6, -2, 3]} scale={[4, 7, 1]} />
      <Lightformer intensity={fill} color={tint} position={[0, -5, 0]} scale={[10, 5, 1]} />
    </>
  )
}

// A hand-built light rig. No HDRI fetch, so the page is self-contained and the
// lighting is ours to tune rather than a downloaded preset's.
//
// Assets inject their own lightformers as children — a catchlight only reads as
// a reflection if it lives in the environment map, so it can't just be a mesh.
export function LightRig({ scope, defaults = {}, base = true, children }) {
  return (
    <Environment resolution={256}>
      {base ? <BaseFormers scope={scope} defaults={defaults} /> : null}
      {children}
    </Environment>
  )
}
