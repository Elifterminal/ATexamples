import { GlassKnot } from './GlassKnot.jsx'
import { GlassEye, EyeLights } from './GlassEye.jsx'

// The catalogue. Every entry gets a stable `id` you can refer to in a brief, a
// short human `name`, and an honest note on what the geometry actually is —
// because the point of this page is knowing what's cheap to reach for.
//
// `light` is each asset's own lighting recipe. A rig that flatters a knot
// wrecks a sphere: big rectangular lightformers read as grey smudges reflected
// off an orb, but they're exactly what gives the knot its edges. Lighting
// belongs to the asset, not to the page.
export const CATALOGUE = [
  {
    id: 'glass-knot',
    name: 'Knot',
    line: 'Parametric torus knot in transmission glass.',
    geometry: 'torusKnotGeometry — one Three.js built-in, 220 × 32 segments',
    distance: 5,
    light: { key: 1.4, rim: 0.9, fill: 0.25 },
    Component: GlassKnot,
  },
  {
    id: 'glass-eye',
    name: 'Ocellus',
    line: 'A radial iris suspended in a glass orb. Instanced fibres, deterministic.',
    geometry: 'sphere + circles + torus + ~220 instanced boxes',
    // No base rig at all. Rectangular formers reflect off an orb as grey
    // smudges; this asset is lit entirely by its own round catchlights.
    distance: 2.9,
    light: { base: false },
    Component: GlassEye,
    Lights: EyeLights,
  },
]
