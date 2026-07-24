import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useControls } from 'leva'

// Threshold is the knob that separates a glow that looks lit from one that
// looks like a filter. Most of the cheap look lives in dropping it too low —
// but an asset built around emissive particles genuinely needs it low, which is
// why the recipe belongs to the asset rather than the page.
export function Post({ scope, defaults = {} }) {
  const { bloom, threshold, vignette } = useControls(`${scope} · post`, {
    bloom: { value: defaults.bloom ?? 0.5, min: 0, max: 4, step: 0.01 },
    threshold: { value: defaults.threshold ?? 0.9, min: 0, max: 1, step: 0.01 },
    vignette: { value: defaults.vignette ?? 0.6, min: 0, max: 1.5, step: 0.01 },
  })

  return (
    <EffectComposer>
      <Bloom
        intensity={bloom}
        luminanceThreshold={threshold}
        luminanceSmoothing={0.3}
        mipmapBlur
      />
      <Vignette darkness={vignette} offset={0.25} />
    </EffectComposer>
  )
}
