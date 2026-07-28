# log

The asset log — an open notebook for the study, published at
[/ATexamples/log/](https://elifterminal.github.io/ATexamples/log/).

## The one rule

**Nothing in the page is hand-written.** `public/log/index.html` is generated. Edit
`manifest.json`, never the HTML.

```
npm run log         # regenerate public/log/index.html from manifest.json
npm run log:check   # fail if the page, the manifest and the repo disagree
```

`npm run build` runs the check first, so a stale or hand-edited page cannot ship.

## Adding a revision

Every time an asset changes, add an entry to that asset's `revisions` array:

```json
{
  "date": "2026-07-28",
  "kind": "failure",
  "ask": "A-13",
  "lessons": ["L-15"],
  "change": "What was actually done.",
  "why": "Why — including what it looked like when it was wrong."
}
```

`kind` is one of `born` `feature` `fix` `failure` `perf` `rename`. The first revision
of any asset must be `born`. `ask` and `lessons` are optional but checked: cite an id
that doesn't exist and the build fails.

If the change came from a directive, add it to `asks` first and cite its id. Quote
verbatim in `verbatim` when the wording matters — the exact phrasing is often the
useful part.

## What the checker enforces

- Every cited ask, lesson, rule and asset id resolves
- Revisions are chronological, and each has a `why`
- Every example folder named actually exists
- The committed page matches what the generator produces right now
- An example committed more recently than `page.updated` warns — that's the
  "code changed, log didn't" case
- **No private project names leak into this public page** (see `FORBIDDEN` in
  `check_manifest.py`)

## Editorial

Failures carry the same weight as wins, in their original wording. A log that only
recorded what worked would be missing most of the information — and every rule in the
`rules` array was paid for by something in the `failure` entries.
