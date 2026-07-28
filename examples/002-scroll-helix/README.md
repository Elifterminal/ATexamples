# 002 · Scroll Helix

The capability test for scroll-driven navigation — the last real unknown before committing to a concept.

Horizontal scroll moves a camera along a static glass helix. The particles inside drift on their own and surge with scroll velocity. A veil of very small particles orbits the outside. Cards are real DOM anchors positioned by projecting world coordinates every frame.

Scroll with a wheel, trackpad, arrow keys, page up/down, home/end, or touch.

## What it was testing

Four things, in order of how much doubt there was.

**Does scroll-driven camera work in our stack?** Yes, and it's cheap. Progress is normalised 0→1 from a native scroll container, smoothed frame-rate-independently, and drives camera position. The native container means touch, momentum and scrollbars come free.

**Does "alive at rest, surges when pushed" actually feel different?** The flow accumulator advances by `delta * (drift + |scrollVelocity| * surge)`. Drift is never zero, so the page keeps breathing when the user stops. Tie particles to scroll alone and the page dies in their hands the moment they stop moving — it's a one-line difference and a large perceptual one.

**Can cards be real links?** Yes, and they should be. They're `<a>` elements in a normal DOM layer, positioned by projecting their world position to screen pixels each frame. Keyboard-navigable, screen-reader-readable, indexable, browser-rendered text. They fade with distance from the camera so they arrive and leave rather than popping.

**Does the responsive strategy hold?** Partly. See below — this is the useful result.

## What it found

**Pixel-decoupling works exactly as intended.** The scroll span is set in viewport units (`700vw`), so the journey is 7 viewport-widths on every device. Measured: 7700/1100 on desktop, 2940/420 on a phone — identical ratio. A phone and an ultrawide travel the same distance at different scales, which is the whole point.

**Fitting a fixed world-width is NOT enough, and this was the real finding.** The first version computed camera distance so a chosen world-width always fit the frame. On desktop it was right. On portrait it pushed the camera so far back that the helix became a thread floating in empty space — technically correct framing, visually dead. The mitigation here scales the visible span with aspect ratio as well, so narrow screens show fewer turns at a size that still reads.

That improves portrait from broken to acceptable. It does not make it good. A horizontal form in a tall frame wastes most of the screen no matter how it's scaled, and the honest fix is a **rotated vertical variant** designed as its own composition — which is also free of seams, since the two variants never appear together.

**Ordering matters for a full-screen scroll proxy.** The scroll surface sits over the canvas to catch gestures, and in the first version it also sat over the cards and swallowed every click. The scroller has to come before the interactive layers in the DOM. The wheel listener lives on `window` rather than the scroller for the same reason — otherwise the wheel stops working whenever the cursor is over a card.

## The veil

A second particle system, added later, orbiting the outside of the glass rather than running through the inside of it. It has two states and the contrast between them is the point: while the scroll is moving it streams and stays coherent, and once you let go it breaks up and wanders. A `calm` term eased toward `1 - min(1, |velocity| * 2.5)` multiplies every turbulence term, so the transition arrives over about half a second instead of switching on the frame the wheel stops.

Orbiting the form's **long axis** is what makes it work. Particles cross in front of the glass and then behind it, which is what sells a volume around the object — drift them past it instead and they read as a layer beside it. Depth testing stays on for the same reason: the tube has to be able to hide what's behind it.

About 30% of the particles orbit the other way, so the cloud churns through itself rather than turning like a wheel. Scroll velocity feeds two accumulators — one adds swirl, the other drags the whole population along the axis, wrapped so scrolling can never empty the volume out.

Three things went wrong that are worth keeping:

- **"Very small" in world units came out sub-pixel on screen.** At about a quarter of a pixel WebGL clamps a point to one hard dot and the soft falloff in the fragment shader never runs at all, so the veil rendered as a starfield. Work out the on-screen pixel size at the camera distance the scene actually uses before picking the default.
- **A peaked falloff plus a bloom threshold makes sparkles.** Cubing the alpha concentrated it in the sprite centre, which then cleared the bloom threshold on its own. A broad gaussian keeps each particle under the threshold and only brightens where several overlap — accumulation is what reads as smoke.
- **Clearance measured from the centreline put the veil inside the glass.** The inner radius was a multiple of the helix radius, which ignores the tube's own thickness, so the floor sat *inside* the wall; the billow term then scaled that radius and could push particles further in still. Clearance is now measured from `radius + tube`, and billow displaces the shell *fraction* (reflected at both ends) so the radius is structurally unable to leave the sheath.

None of those three were visible in a still frame — all were found by re-running the vertex shader on the CPU and asserting the properties directly: minimum radius clears the glass, both spin directions exist, nothing escapes the span at any scroll distance, the axial distribution stays even after drifting. That check costs about eighty lines and needs no GPU.

Whether it reads as *smoke* or as *fine dust* is still open. It has only been looked at through a CPU-rendered frame at 640×400, and density and sprite size are exactly what resolution changes. The knobs are all in `smoke`.

## Seams, and where they hide

- **The helix's ends** — the form is 60 units long and the camera only travels 42, so the termini are never in frame. Nothing whole is visible, so nothing can be cropped wrong.
- **Card arrival** — opacity ramps with camera distance; `pointer-events` and `tabIndex` follow it, so a faded card isn't a click or tab target.
- **Section boundaries** — there are none. One camera, one continuous object.
- **Still open: the page transition.** Clicking a card here does a normal page load, which is the one seam still fully visible. Hiding it needs a persistent WebGL context with DOM swapping around it, and that's an architectural decision rather than a tweak.

## Performance

Tuned, but not measured here — the browser this was built through renders on the
CPU, so no framerate number from the build process would mean anything. Instead
the page measures itself on whatever GPU it lands on, and every expensive knob is
exposed so you can find your own ceiling.

**Turn on `perf → stats`** for a live FPS panel. The HUD shows the current pixel
ratio, which adapts on its own.

| lever | was | now | why it costs |
|---|---|---|---|
| pixel ratio | fixed `[1, 2]` | adaptive, 0.75–2.0 | cost scales with the *square*; 2.0 → 1.5 is 44% fewer pixels shaded |
| transmission resolution | 512 | 256 | this material re-renders the whole scene into a buffer every frame; 512→256 is a quarter of the pixels |
| `backside` | on | off | renders the mesh twice through that pass — the most expensive checkbox here |
| composer multisampling | 8 (library default) | 2 | full-screen MSAA on every pass; bloom hides much of what it buys |

The pixel ratio walks itself up when frames are cheap and down when they aren't,
so a 1080 Ti and a laptop integrated GPU both land somewhere sensible without a
device check.

**Bug found while doing this:** the merged tube geometries were rebuilt by
`useMemo` on every parameter change and the previous buffers were never freed —
so dragging a slider leaked GPU memory until the tab closed. Both are disposed
now.

**And the same bug again, later, one file over.** `HelixParticles` leaked its
geometry on every count change in exactly the same way. The original fix went in
where the bug was found rather than everywhere the pattern occurred, so it
survived — and was only noticed because the veil needed the same disposal and the
neighbouring file happened to be open.

These are arithmetic reductions in work, not measured framerate gains. The stats
panel is the only real evidence, and it runs on your machine, not mine.

Tube tessellation is also exposed here (`perf → segmentsPerTurn`), since a long
helix multiplies segment count by its number of turns.

## Known

The card links are stand-ins pointing at real pages in this repo, not a designed navigation.

## Lifting it

`npm i three @react-three/fiber @react-three/drei @react-three/postprocessing leva`, copy this folder. Nothing imports from another example — `scene/helixCurve.js` is duplicated from 001 on purpose, so this folder stays liftable whole.
