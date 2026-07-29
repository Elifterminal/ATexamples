# 002 · Scroll Helix

The capability test for scroll-driven navigation — the last real unknown before committing to a concept.

Horizontal scroll moves a camera along a static glass helix. The particles inside drift on their own and surge with scroll velocity. A veil of very small motes orbits the outside, catching the light now and then, with a few much larger hexagonal flakes tumbling among them. Cards are real DOM anchors positioned by projecting world coordinates every frame.

Scroll with a wheel, trackpad, arrow keys, page up/down, home/end, or touch.

**Live:** <https://elifterminal.github.io/ATexamples/examples/002-scroll-helix/> — add `?tune` to the URL for the control panel, which is otherwise hidden outside development.

## What it was testing

Four things, in order of how much doubt there was.

**Does scroll-driven camera work in our stack?** Yes, and it's cheap. Progress is normalised 0→1 from a native scroll container, smoothed frame-rate-independently, and drives camera position. The native container means touch, momentum and scrollbars come free.

**Does "alive at rest, surges when pushed" actually feel different?** The flow accumulator advances by `delta * (drift + |scrollVelocity| * surge)`. Drift is never zero, so the page keeps breathing when the user stops. Tie particles to scroll alone and the page dies in their hands the moment they stop moving — it's a one-line difference and a large perceptual one.

**Can cards be real links?** Yes, and they should be. They're `<a>` elements in a normal DOM layer, positioned by projecting their world position to screen pixels each frame. Keyboard-navigable, screen-reader-readable, indexable, browser-rendered text. They fade with distance from the camera so they arrive and leave rather than popping. They now sit on WebGL glass panels — see below — but the anchors themselves are unchanged.

**Does the responsive strategy hold?** Partly. See below — this is the useful result.

## What it found

**Pixel-decoupling works exactly as intended.** The scroll span is set in viewport units (`700vw`), so the journey is 7 viewport-widths on every device. Measured: 7700/1100 on desktop, 2940/420 on a phone — identical ratio. A phone and an ultrawide travel the same distance at different scales, which is the whole point.

**Fitting a fixed world-width is NOT enough, and this was the real finding.** The first version computed camera distance so a chosen world-width always fit the frame. On desktop it was right. On portrait it pushed the camera so far back that the helix became a thread floating in empty space — technically correct framing, visually dead. The mitigation here scales the visible span with aspect ratio as well, so narrow screens show fewer turns at a size that still reads.

That improves portrait from broken to acceptable. It does not make it good. A horizontal form in a tall frame wastes most of the screen no matter how it's scaled, and the honest fix is a **rotated vertical variant** designed as its own composition — which is also free of seams, since the two variants never appear together.

**Ordering matters for a full-screen scroll proxy.** The scroll surface sits over the canvas to catch gestures, and in the first version it also sat over the cards and swallowed every click. The scroller has to come before the interactive layers in the DOM. The wheel listener lives on `window` rather than the scroller for the same reason — otherwise the wheel stops working whenever the cursor is over a card.

## The dust

A second particle system, added later, orbiting the outside of the glass rather than running through the inside of it. It was built as smoke and it came out as fine dust, so it is dust now — that's a deliberate reclassification rather than a failed attempt, and it changes what to do with it: dust is discrete motes that catch light individually, which is worth leaning into rather than blurring away. It has two states and the contrast between them is the point: while the scroll is moving it streams and stays coherent, and once you let go it breaks up and wanders. A `calm` term eased toward `1 - min(1, |velocity| * 2.5)` multiplies every turbulence term, so the transition arrives over about half a second instead of switching on the frame the wheel stops.

Orbiting the form's **long axis** is what makes it work. Particles cross in front of the glass and then behind it, which is what sells a volume around the object — drift them past it instead and they read as a layer beside it. Depth testing stays on for the same reason: the tube has to be able to hide what's behind it.

About 30% of the particles orbit the other way, so the cloud churns through itself rather than turning like a wheel. Scroll velocity feeds two accumulators — one adds swirl, the other drags the whole population along the axis, wrapped so scrolling can never empty the volume out.

Three things went wrong that are worth keeping:

- **"Very small" in world units came out sub-pixel on screen.** At about a quarter of a pixel WebGL clamps a point to one hard dot and the soft falloff in the fragment shader never runs at all, so the veil rendered as a starfield. Work out the on-screen pixel size at the camera distance the scene actually uses before picking the default.
- **A peaked falloff plus a bloom threshold makes sparkles.** Cubing the alpha concentrated it in the sprite centre, which then cleared the bloom threshold on its own. A broad gaussian keeps each particle under the threshold and only brightens where several overlap — accumulation is what reads as smoke.
- **Clearance measured from the centreline put the veil inside the glass.** The inner radius was a multiple of the helix radius, which ignores the tube's own thickness, so the floor sat *inside* the wall; the billow term then scaled that radius and could push particles further in still. Clearance is now measured from `radius + tube`, and billow displaces the shell *fraction* (reflected at both ends) so the radius is structurally unable to leave the sheath.

None of those three were visible in a still frame — all were found by re-running the vertex shader on the CPU and asserting the properties directly: minimum radius clears the glass, both spin directions exist, nothing escapes the span at any scroll distance, the axial distribution stays even after drifting. That check costs about eighty lines and needs no GPU.

### The sparkle

A convincing glint needs a **where** and a **when**, multiplied. A half-vector facet term decides where a glint is geometrically possible; a per-particle flicker decides when it fires. On their own, either one reads as the whole field blinking on a timer. Together, glints cluster in the band that actually faces the key and only a handful fire at once — measured at roughly 98 of 40,000 at any instant, all of them on the lit side of the axis. Only 14% of motes are reflective at all, and a glinting mote also grows about 90%, which turns out to be most of what sells it as catching light rather than merely brightening.

That was verified numerically, not by eye — a still frame catches one arbitrary instant of an intermittent effect, so it can neither confirm nor refute it.

Knobs are in `dust` and `sparkle`.

## The flakes

Rare, several times larger than the dust, and the only thing in the sheath with a **face**.

That's the whole reason they're real instanced geometry rather than bigger sprites. A point sprite is always square-on to the camera, so the only thing it can express is intensity — it can brighten, it can't turn away. A flat plate has an orientation, and orientation is what lets it catch the light, sweep colour across its face, and then thin to nothing edge-on. The edge-on disappearance costs one dot product against the view direction and does more for the falling-snow read than the tumble maths does.

The tumble is two angles advancing at unrelated per-plate rates, plus a slow flutter term. Because the rates never share a period the motion has no visible loop, which is most of what "random" means to an eye watching for a few seconds. It runs on its own clock rather than the orbit's — snow keeps turning at the same lazy rate whether or not it's being blown along, and tying the two together made the plates spin up whenever the page scrolled, which read as debris in a wind tunnel.

Measured rather than guessed: a full turn takes about **38 seconds**, the fastest plate tumbles 12× the slowest, and roughly 11 of 220 plates are flashing at any instant, each lit about 2% of the time. Snow is slower than instinct suggests — the first guess was several times too fast.

Iridescence is three offset cosines driven by the viewing angle. No texture, and because it's driven by angle rather than time the hue sweeps as the plate turns instead of every plate being the same colour at once.

**Hue and flash are deliberately decoupled**, and that took a correction to arrive at. The first version drove colour from the flash alone, which meant a plate not currently catching the light had no colour — the field sat grey between flashes and only the few flashing plates were iridescent. The obvious fix, widening the flash until everything is always flashing, buys the colour back by destroying the event the flash exists to represent. So `iridBase` carries the tint independently: plates are iridescent all the time, and catching the light adds brightness on top. The shine term uses `abs(dot(normal, half))` — a flake is thin enough that either face can take the light, and without the `abs` it's dead half the time it should be flashing, for no reason a viewer could name.

**One bug worth keeping:** building a local basis from the plate's normal with `cross(up, normal)` collapses to zero every time a plate points straight up — once per tumble, per plate, forever. The reference vector has to swap when the normal nears vertical. Checked rather than assumed: the smallest cross product over 400 simulated seconds is 0.31.

### Shared motion

The flakes ride the *identical* orbit as the dust — the same GLSL and the same update function, pulled into `scene/orbit.js` and consumed by both.

Copying the shader would have satisfied "behaves the same way as the dust" on the first day and broken it the first time either one was tuned. That breakage is invisible: nothing errors, the two just quietly stop agreeing. Sharing the code makes sameness structural instead of remembered — the same principle the generated log runs on.

## The panels

Large frosted slabs standing forward of the form, carrying the navigation and overlapping the helix without hiding it.

**Half WebGL, half DOM, on purpose.** Real refraction can only come from WebGL, but the cards were this example's actual finding — real anchors with keyboard navigation, screen-reader text and browser-rendered type. Rebuilding them in WebGL would have bought the material by giving back the result. So the glass is a mesh in the scene and the label stays a DOM anchor on top of it. The one stated cost: **flakes cross in front of the glass but never in front of the type.**

The panel is an extruded rounded rectangle with a bevel. The bevel is most of why it reads as a slab rather than a decal — it gives the rim a surface at an angle to the face, so the edge picks up the key and bends what's behind it instead of stopping dead. All five are merged into **one** geometry, the same trick the helix uses for its two strands: the transmission material re-renders the whole scene into a buffer every frame, so five separate panels would mean five extra full scene renders on top of the one the tube already costs.

Flakes orbit out to about 3.9 and the panel face stands at 1.75, so they cross in front of it now and then without being told to.

**The first version was invisible, and that's the useful part.** It was physically correct glass — transmission 1, low roughness, real thickness — and could only be located by the smear it made of the form behind it. A debug pass with an opaque material showed the panel exactly where it should be, at the right size, correctly aligned with its label. The geometry was never wrong: **clear glass on a near-black background has nothing to reflect.** A real panel is found by its edges first, so the edge is now drawn as its own additive ring just proud of the front face, and the surface is frosted enough to scatter the key across itself rather than returning it at a single angle.

Surface texture is a procedural grain map — fine noise plus a low-frequency vertical streak, generated on a canvas at runtime, no external asset.

**Still open:** the panels don't fade with distance but their labels do. The glass is scenery and sits in the world permanently, so at the frame edges you can get a visible panel with no text on it. That may read as natural or as an oversight; only watching it move will tell.

## The screens, and the light through them

Footage plays behind each panel and throws light forward through it.

**The "behind fogged glass" part needed no work at all**, which is the useful finding. It sounds like a video treatment — blur it, desaturate, dim — but the panel in front is already frosted and its transmission pass diffuses whatever sits behind it. A plane placed behind the glass comes out diffused *by the material*, and how far back it sits is the entire distance control. A blur applied to the video would have been a second effect to keep in sync with the glass by hand; this one can't drift, because it's the same physics.

The only distance trick that isn't free: **desaturating rather than dimming**. Distance reads as loss of colour before loss of light.

One caveat worth knowing — the screen has to stay outside 1.45 from the axis, because that's how far the form reaches in any direction. Set it back further than that and it pokes through the tube.

### The beams went wrong twice

**First as hard lines.** A hollow frustum with a rim term — alpha rising where the surface turns edge-on. That's right for a shell standing in for an atmosphere, where you really do see through more material at the limb. On an open cone it puts maximum brightness exactly along the silhouette, so it drew two crisp diagonals across the frame: a picture of the geometry, not of light.

**Then as an even wash.** Rebuilt as a stack of soft slices, which fixed the edges and produced a featureless glow. Two separate reasons: a beam aimed at the camera is seen down its own axis and has no length to show, and a plain rectangle emits evenly. Rays are only legible because *something breaks the source up*.

Both fixes come from the scene itself. The rake is blended from the shared light direction — light leaves a window travelling away from whatever lit it — and the striation is two incommensurate frequencies across the beam.

The beam colour is sampled from the footage six times a second, via a 1×1 canvas draw. The browser's own downscale is the averaging, in C, for free.

### One decoder

Five panels suggests five videos, which is five decoders and the reason a page like this stutters on a laptop. One element feeds all five, each taking a different crop of the same frame. It's parked in the document rather than left detached — a detached video decodes in some browsers and quietly doesn't in others, and `display:none` is a documented reason to stop decoding altogether.

### The loops

Each card plays its own clip — five short loops cut from the Blender Foundation's open movies (*Big Buck Bunny* and *Sintel*), CC BY 3.0, 284KB for all five. Credits in [`public/media/ATTRIBUTION.md`](../../public/media/ATTRIBUTION.md). Placeholders for a study; `LOOPS` in `main.jsx` is the list to change.

**Trailers are mostly title cards.** Five clips cut on plausible-looking timestamps came back as three title cards, a fade to black, and two usable shots. Sampling a frame per second into a contact sheet showed the real structure — the source cuts to a title every two or three seconds, so the usable runs are short and have to be found rather than guessed.

They loop by **crossfading the tail back onto the head**, not by palindrome. A palindrome is simpler and reads as *rewind* on character animation; a rabbit walking backwards is not a loop.

### Transparency, and the answer that sounded right

"See the background through them" sounds like additive blending, and for the dark end it's exactly right — black contributes nothing, so the helix reads straight through. But a bright frame then saturates, the bloom pass finds it, and the panel becomes a lit rectangle with no picture in it.

**Normal blending under full opacity is see-through everywhere *and* keeps an image everywhere**, which is what was actually wanted. A luma key holds back the dark end so shadows still drop out. Additive stayed as an option — the holographic read is worth having — but it isn't the default.

### One decoder per card, and only when near

Five clips means five decoders, which is how a page like this stutters on a laptop. Each card plays only inside a radius wider than its fade, so it's already running by the time you can see it, and everything else is paused.

That nearly went wrong: the video element is parked in the document, and the append was written inside the `useMemo` that creates it. StrictMode calls `useMemo` twice with no cleanup between, so every card left an orphan behind and five cards were quietly running **ten** decoders — exactly the cost the design existed to avoid. A DOM side effect belongs in an effect, where there's a cleanup to pair with it. Counted, not assumed: five elements, five distinct sources, two decoding.

## Lighting

The whole scene was flat, and the instinct — reach for the glass material — was wrong. The glass was fine. **The scene was lit four separate ways that didn't agree**: the environment had its own rig, the luminous core was drawn unlit, and both particle systems were flat colour with no notion of a light at all. Nothing agreed about where the light was, so nothing read as lit.

`scene/lighting.js` now exports **one direction**, from elevation and azimuth sliders, and everything that draws a pixel consumes it:

| what | how it uses the direction |
|---|---|
| environment strips | key positioned along it, so moving the light moves the reflection in the glass |
| directional lamp | gives the highlight a *position* — reflection alone moves with the surface but never says where the source is |
| luminous core | half-lambert baked into vertex colours at build time; stays emissive, but gains a top and a bottom |
| dust and flow | half-lambert against each particle's own outward direction from the central axis |
| flakes | half-lambert against the plate's own **face**, so a plate underneath with its face turned up really is catching the key |

Two things mattered more than expected:

**The fill light was most of the flatness.** The original rig lit from above at 4.5 and from below at 2.2. With both sides lit there is no dark side, and without a dark side there is no shape. The bounce is now weak and cold — enough that the underside doesn't read as a hole punched in the form, not enough to compete. It's the single knob that decides whether the thing reads as lit or as merely glowing; push it past about 1 and the shape flattens out again.

**Shading the particles cost one dot product and did more than any material setting.** Each particle already knows its direction out from the central axis — the flow inside the tube had that vector sitting in a variable, unused. Particles are usually thought of as an effect layered over a form, but at 62k they *are* the form, and lighting them is the cheapest structural improvement available.

Glass roughness went from 0.04 to 0.1 with a clearcoat on top: mirror-smooth returns the key as a pinpoint the eye reads as a speck, and a little roughness spreads it into the travelling streak a pipe wants.

**Still open:** whether the key is too hot at the default. The streak reads clearly as light from above, which was the ask, but it blows close to white against a saturated magenta form. That's a judgement about the picture, and it has only been seen through a CPU-rendered frame at 640×400.

## Seams, and where they hide

- **The helix's ends** — the form is 60 units long and the camera only travels 42, so the termini are never in frame. Nothing whole is visible, so nothing can be cropped wrong.
- **Card arrival** — opacity ramps with camera distance; `pointer-events` and `tabIndex` follow it, so a faded card isn't a click or tab target.
- **Section boundaries** — there are none. One camera, one continuous object.
- **The light** — one direction, shared. Four rigs that disagree is its own kind of seam, and the least visible one until you notice everything looks flat.
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

## Sharing it

It had been publicly reachable since the first push, which is not the same as being fit to show anyone. Three things were missing, and none of them are visible while building because the person building it already knows how it works:

- **A tuning panel greeted every visitor.** It's for making the thing, not for looking at it. Now it appears in development and behind `?tune`, and nowhere else.
- **Nothing said the page moves sideways.** A visitor who doesn't discover that sees a still picture and leaves. A one-line hint says so and disappears the moment they touch anything, so it never becomes furniture for someone who already knows.
- **A shared link unfurled with no picture.** There's a preview image now, which doubles as the gallery thumbnail.

The panel-hiding was verified twice. The first check queried an element id the library doesn't use, so it reported the panel absent — and would have reported that whether or not the panel was there. It was caught only because the same selector then claimed the panel was missing from a build where it was demonstrably present. A check that has only ever returned the answer you wanted might be measuring nothing.

## Lifting it

`npm i three @react-three/fiber @react-three/drei @react-three/postprocessing leva`, copy this folder. Nothing imports from another example — `scene/helixCurve.js` is duplicated from 001 on purpose, so this folder stays liftable whole.
