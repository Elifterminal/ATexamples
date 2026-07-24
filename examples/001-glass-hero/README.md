# 001 · Glass Hero

**What it's testing** — the baseline. One refractive form, lit deliberately, graded with bloom and vignette, every knob on a slider. No scroll, no particles, no cleverness.

**Why start here** — a study that does one thing is the only kind you can learn from. If this doesn't look expensive, nothing built on top of it will, and the problem will be lighting or grade rather than complexity. Later studies get measured against it.

**What's in it**

- `MeshTransmissionMaterial` for the glass — refraction, chromatic aberration, distortion
- A hand-built light rig using drei `Lightformer`s inside `<Environment>`, so there's no HDRI fetch. The lighting is ours to tune rather than a downloaded preset's, and the page works offline
- `Bloom` + `Vignette` post
- A Leva panel exposing form, glass, light, post and world — the whole surface
- A thin DOM HUD over a full-bleed canvas, `mix-blend-mode: difference` so it stays legible against any background

**Knobs worth pushing first**

`glass.ior` between 1.3 and 1.6 is where it reads as glass rather than plastic or water. `glass.thickness` past ~3 goes murky and heavy fast. `post.threshold` is the difference between a glow that looks lit and one that looks like a filter — most of the cheap look lives in dropping it too low.

**What it taught** — _fill in after playing with it._

**Lifting it** — `npm i three @react-three/fiber @react-three/drei @react-three/postprocessing leva`, copy this folder. Nothing here imports from another example.
