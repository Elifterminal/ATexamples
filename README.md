# ATexamples

Front-end studies in WebGL and Three.js — scroll-driven, shader-led, immersive rather than documentary.

**[View the gallery →](https://elifterminal.github.io/ATexamples/)**

Each study is one self-contained page exploring a single technique. They start deliberately simple and climb. The point isn't any individual page — it's building a library of front ends worth reaching for later, when one of them becomes the shell of a real application.

## Why it's a pile of static pages

Because that's the honest shape of the problem. This is aesthetic and interaction work: geometry, materials, lighting, motion timing, post-processing, how a page feels under a scroll wheel. None of that needs a server. Three.js runs client-side, Vite compiles to plain HTML/JS/CSS, GitHub Pages serves it, and the deploy is a push.

The back end comes later, and it comes to whichever of these earns it.

## Getting around

```bash
npm install
npm run dev        # gallery at localhost:5173, click through to any study
npm run build      # static output in dist/
npm run preview    # serve the built output exactly as Pages will
```

```
index.html          the gallery — builds itself from each example's meta.json
gallery/            its styles and logic
examples/
  001-glass-catalogue/  one folder per study, each independently liftable
docs/
  CONVENTIONS.md    naming + meta.json fields. Read before adding a study
scripts/
  new-example.mjs   scaffolder that enforces the convention
```

## Adding a study

```bash
npm run new -- particles-flowfield
```

Folders are named `NNN-technique-descriptor` — `001-glass-catalogue`, `002-particles-flowfield`, `003-sdf-tunnel-scroll`. The number is the capability ladder, the technique is the one thing being demonstrated, the descriptor is the flavor.

The folder name is for scanning by eye. The searchable detail lives in `meta.json` — techniques, interaction model, stack, mood, difficulty, and `reusable_as`, which is the field that makes a study findable the day you actually need it. The gallery reads those files directly, so a new study appears the moment its folder exists. Nothing to register.

Full rules in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## Working rules

**One repo, one build, but no coupling between studies.** Shared `package.json` so adding a study isn't another dependency tree. Nothing imports across example folders — if two studies want the same helper, copy it. Duplication is what makes a folder draggable into another project.

**Local assets only.** No CDN environment maps, no external fonts. A page that needs the network to look right isn't a template.

**Every aesthetic knob gets a slider.** Leva panels aren't debug tooling here, they're the workflow — the eye tunes the pixels directly and the good numbers get committed afterward. Describing a look in words loses most of it; turning a dial loses none.

**Free assets are clay.** The expensive feeling comes from lighting, grade, material, motion and post — never from the mesh you downloaded. A generic rock lit well looks custom. The same rock with its default texture looks like a free rock.

## Studies

| | study | technique | reusable as |
|---|---|---|---|
| 001 | [Glass Catalogue](examples/001-glass-catalogue/) | transmission, instancing, particles | landing hero |

## License

MIT — see [`LICENSE`](LICENSE). Take anything.
