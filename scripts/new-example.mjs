#!/usr/bin/env node
// Scaffolds an example folder that already obeys the naming convention, so the
// convention holds by construction instead of by discipline.
//
//   npm run new -- particles-flowfield    → 00N-particles-flowfield
//   npm run new -- 007-sdf-tunnel         → exactly that

import { mkdir, readdir, writeFile, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXAMPLES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'examples')
const SLUG_PATTERN = /^\d{3}-[a-z0-9]+-[a-z0-9-]+$/
const NAME_PATTERN = /^[a-z0-9]+-[a-z0-9-]+$/

function fail(message) {
  console.error(`\n  ✗ ${message}\n`)
  process.exit(1)
}

async function existingSlugs() {
  try {
    const entries = await readdir(EXAMPLES_DIR, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

function nextSequence(slugs) {
  const highest = slugs.reduce((max, slug) => {
    const parsed = Number.parseInt(slug.slice(0, 3), 10)
    return Number.isNaN(parsed) ? max : Math.max(max, parsed)
  }, 0)

  return String(highest + 1).padStart(3, '0')
}

async function resolveSlug(input, slugs) {
  if (SLUG_PATTERN.test(input)) return input

  if (NAME_PATTERN.test(input)) return `${nextSequence(slugs)}-${input}`

  fail(
    `"${input}" doesn't fit the convention.\n\n` +
      '    Expected  NNN-technique-descriptor  (or technique-descriptor to auto-number)\n' +
      '    Examples  002-particles-flowfield · sdf-tunnel-scroll\n\n' +
      '    Lowercase and hyphens only. See docs/CONVENTIONS.md.',
  )
}

const template = {
  'index.html': (slug, title) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${slug.slice(0, 3)} · ${title} — ATexamples</title>
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='10' fill='none' stroke='%237dd3fc' stroke-width='3'/%3E%3C/svg%3E"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.jsx"></script>
  </body>
</html>
`,

  'main.jsx': (slug, title) => `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { Leva, useControls } from 'leva'
import './style.css'

function Scene() {
  // Wire the aesthetic knobs to Leva from the start — the panel is the workflow,
  // not a debugging afterthought.
  const { color } = useControls('form', { color: '#7dd3fc' })

  return (
    <mesh>
      <icosahedronGeometry args={[1.4, 0]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

function Hud() {
  return (
    <div className="hud">
      <div className="hud-row">
        <span>${slug.slice(0, 3)} — ${title}</span>
        <a href="../../">index</a>
      </div>
    </div>
  )
}

function App() {
  const { background } = useControls('world', { background: '#07080c' })

  return (
    <>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={[background]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 4, 5]} intensity={2} />
        <Scene />
      </Canvas>

      <Hud />
      <Leva titleBar={{ title: '${slug}' }} collapsed />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,

  'style.css': () => `:root {
  --ink: #e7e9ef;
  --muted: #767e94;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background: #07080c;
  color: var(--ink);
  font-family: var(--mono);
  overflow: hidden;
}

canvas {
  display: block;
}

.hud {
  position: fixed;
  inset: 0;
  padding: clamp(1rem, 3vw, 2rem);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
  font-size: 12px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  mix-blend-mode: difference;
}

.hud-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.hud a {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid currentColor;
  pointer-events: auto;
}
`,

  'meta.json': (slug, title, today) =>
    `${JSON.stringify(
      {
        title,
        techniques: ['TODO'],
        interaction: 'static',
        stack: ['r3f', 'leva'],
        mood: 'TODO',
        difficulty: 1,
        reusable_as: 'TODO',
        date: today,
        notes: 'What this study is testing.',
      },
      null,
      2,
    )}\n`,

  'README.md': (slug, title) => `# ${slug.slice(0, 3)} · ${title}

**What it's testing** — one sentence.

**What it taught** — fill in after building, including what didn't work.

**Lifting it** — install the deps listed in \`meta.json\` \`stack\`, copy this folder.
Nothing here imports from another example.
`,
}

async function main() {
  const input = process.argv[2]

  if (!input) {
    fail('Give it a name.\n\n    npm run new -- particles-flowfield')
  }

  const slugs = await existingSlugs()
  const slug = await resolveSlug(input, slugs)
  const dir = resolve(EXAMPLES_DIR, slug)

  const taken = await access(dir).then(
    () => true,
    () => false,
  )
  if (taken) fail(`examples/${slug} already exists.`)

  const title = slug
    .slice(4)
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')

  const today = new Date().toISOString().slice(0, 10)

  await mkdir(dir, { recursive: true })
  await Promise.all(
    Object.entries(template).map(([filename, render]) =>
      writeFile(resolve(dir, filename), render(slug, title, today)),
    ),
  )

  console.log(`\n  ✓ examples/${slug}\n`)
  console.log('    npm run dev     then open the card from the index')
  console.log('    edit meta.json  techniques, mood, reusable_as — that is what makes it findable later\n')
}

main().catch((error) => fail(error.message))
