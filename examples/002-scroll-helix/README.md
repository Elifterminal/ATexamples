# 002 · Scroll Helix

The capability test for scroll-driven navigation — the last real unknown before committing to a concept.

Horizontal scroll moves a camera along a static glass helix. The particles inside drift on their own and surge with scroll velocity. Cards are real DOM anchors positioned by projecting world coordinates every frame.

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

These are arithmetic reductions in work, not measured framerate gains. The stats
panel is the only real evidence, and it runs on your machine, not mine.

Tube tessellation is also exposed here (`perf → segmentsPerTurn`), since a long
helix multiplies segment count by its number of turns.

## Known

The card links are stand-ins pointing at real pages in this repo, not a designed navigation.

## Lifting it

`npm i three @react-three/fiber @react-three/drei @react-three/postprocessing leva`, copy this folder. Nothing imports from another example — `scene/helixCurve.js` is duplicated from 001 on purpose, so this folder stays liftable whole.
