import { PerformanceMonitor } from '@react-three/drei'

const DPR_STEP = 0.25
const DPR_FLOOR = 0.75
const DPR_CEIL = 2

// I can't measure framerate while building this — the headless browser renders
// on the CPU. So the page measures itself on whatever GPU it lands on and walks
// the pixel ratio up or down accordingly.
//
// Resolution is the right lever because it's the one whose cost scales with the
// square: 2.0 → 1.5 is a 44% cut in pixels shaded, and it's far less visible
// than dropping an effect.
export function AdaptiveQuality({ onChange }) {
  return (
    <PerformanceMonitor
      onDecline={() => onChange((dpr) => Math.max(DPR_FLOOR, dpr - DPR_STEP))}
      onIncline={() => onChange((dpr) => Math.min(DPR_CEIL, dpr + DPR_STEP))}
    />
  )
}
