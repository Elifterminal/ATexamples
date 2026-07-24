# Conventions

The point of this repo is that a study you built months ago is still findable and
still liftable. Two rules carry that weight: the folder name, and `meta.json`.

## Folder names

```
NNN-technique-descriptor
```

| part | what it does | examples |
|---|---|---|
| `NNN` | zero-padded sequence. Encodes the capability ladder — later numbers are more advanced, and the history reads as a progression. Never reused, never renumbered. | `001`, `014`, `107` |
| `technique` | the *primary* thing being demonstrated. One word. If you can't pick one, the study is doing too much. | `glass`, `particles`, `sdf`, `gpgpu`, `scroll`, `text`, `postfx` |
| `descriptor` | the flavor or application. Hyphens allowed. | `hero`, `flowfield`, `tunnel-scroll`, `gallery` |

```
001-glass-catalogue
002-particles-flowfield
003-sdf-tunnel-scroll
```

Lowercase, hyphens only. The name is for scanning by eye — keep it short and let
`meta.json` carry the detail.

## meta.json

Every example needs one. The gallery reads these to build itself, and later this
is how you answer "show me everything that used transmission with scroll."

```json
{
  "title": "Glass Hero",
  "techniques": ["transmission", "bloom", "vignette"],
  "interaction": "scroll",
  "stack": ["r3f", "drei", "postprocessing", "leva"],
  "mood": "cold, minimal, high-contrast",
  "difficulty": 1,
  "reusable_as": "landing hero",
  "date": "2026-07-24",
  "notes": "What this was actually testing, and what it taught."
}
```

| field | notes |
|---|---|
| `title` | human name shown on the card |
| `techniques` | the searchable axis. Reuse existing terms rather than inventing synonyms — `transmission` or `glass`, pick one and stay with it |
| `interaction` | `scroll`, `hover`, `cursor`, `static`, `orbit` … how the user drives it |
| `stack` | what it actually imports. This is what tells future-you the cost of lifting it |
| `mood` | plain language. The thing that's hardest to search for and most worth recording |
| `difficulty` | 1–5, honest. Useful for picking what to attempt next |
| `reusable_as` | the real payoff field — `landing hero`, `section transition`, `full-page background`, `loader` |
| `notes` | what it was testing and what it taught, including failures |

Add fields freely. The gallery ignores what it doesn't know, so nothing breaks.

## Adding an example

```bash
npm run new -- particles-flowfield     # picks the next number automatically
npm run new -- 007-sdf-tunnel          # or set it yourself
```

That scaffolds the folder from a template. Vite discovers it, the gallery
discovers it. No config to edit and no list to register in.

## Keeping examples liftable

The whole repo shares one `package.json` so adding a study doesn't mean another
dependency tree. That's a convenience for building, not an excuse for coupling:

- **Nothing imports across example folders.** If two studies want the same helper,
  copy it. Duplication is the price of a folder you can drag into another project.
- **`stack` in `meta.json` is the contract.** It's what you `npm install` when you
  lift the folder out.
- **Local assets only.** No CDN HDRIs, no external fonts. A study that needs the
  network to look right isn't a template, it's a liability.

## Thumbnails

Drop a `thumb.png` (or `.jpg` / `.webp`) in the folder and the gallery picks it up
automatically. 16:10 reads best. Without one the card shows a gradient placeholder,
which is fine — a missing screenshot shouldn't block shipping the study.
