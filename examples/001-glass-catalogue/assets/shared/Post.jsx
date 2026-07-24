import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useControls } from 'leva'

// Threshold is the knob that separates a glow that looks lit from one that looks
// like a filter. Most of the cheap look lives in dropping it too low.
export function Post() {
  const { bloom, threshold, vignette } = useControls('post', {
    bloom: { value: 0.5, min: 0, max: 4, step: 0.01 },
    threshold: { value: 0.9, min: 0, max: 1, step: 0.01 },
    vignette: { value: 0.6, min: 0, max: 1.5, step: 0.01 },
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
