# 001 · Glass Catalogue

A browsable set of named procedural glass assets. No models, no downloaded meshes — every form is a Three.js built-in primitive or instanced geometry, and the whole look comes from lighting, material and post.

Browse with `←` `→` or the list in the corner. Every knob is on the Leva panel.

## The catalogue

| id | name | geometry |
|---|---|---|
| `glass-knot` | Knot | `torusKnotGeometry` — one built-in, 220 × 32 segments |
| `glass-eye` | Ocellus | sphere + circles + torus + ~220 instanced boxes |

Refer to assets by `id`. The ids are stable; names and tuning are not.

## What each one is actually made of

**Knot** — a single parametric primitive in a transmission material. The smoothness is tessellation, and it's free because the form is generated from a formula rather than stored. This is the whole "you don't need a model" argument in one line of JSX.

**Ocellus** — an eye with nothing modeled in it. A dark disc, a torus for the limbal ring, a black circle for the pupil, ~220 instanced boxes fanned out radially for the iris fibres, and a sphere of glass over the top. The orb's refraction magnifies and bends the fibres, which is what sells it. Fibre placement runs off a seeded PRNG so the asset looks identical on every load — a lottery on refresh isn't something you can art-direct.

## What building this taught

**Glass shows you what's behind it, and against a black background that's nothing.** The first version of Ocellus was almost entirely black. A transmission sphere over a dark interior absorbs everything. The fix was making the iris emit its own light and thinning the orb — not adding more lights.

**Lighting belongs to the asset, not the page.** The four-panel rig that flatters the Knot ruined the eye: big rectangular lightformers reflect off a sphere as literal grey rectangles and instantly read as CG. Each catalogue entry now carries its own `light` recipe, and Ocellus opts out of the base rig entirely in favour of round catchlights. Circular formers are most of what makes an eye look wet.

**Don't nest transmission passes.** The iris fibres were originally a transmission material too, sitting inside the orb's transmission pass. Each one forces its own full-scene render, and nesting them tanked the frame hard enough that headless screenshots timed out. Clearcoat and iridescence read as glass here because the orb in front is doing the real refracting.

**Leva persists by control path.** Remounting a component doesn't reset its values, so per-asset defaults silently did nothing until the control folders were scoped per asset. Worth remembering for any future asset switcher.

## Known

Not performance-tuned. `MeshTransmissionMaterial` re-renders the scene every frame, `backside` on the Knot doubles that, and `dpr={[1, 2]}` doubles pixel work again on a high-DPI display. A pass is owed.

## Lifting it

`npm i three @react-three/fiber @react-three/drei @react-three/postprocessing leva`, copy this folder. Nothing here imports from another example. `assets/index.js` is the registry — add an entry and it appears in the browser strip.
