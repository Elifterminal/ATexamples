import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const examplesDir = resolve(root, 'examples')

// Every examples/<slug>/index.html becomes its own build entry. Adding an
// example is a folder, never a config edit.
function exampleEntries() {
  if (!existsSync(examplesDir)) return {}

  return Object.fromEntries(
    readdirSync(examplesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => [entry.name, resolve(examplesDir, entry.name, 'index.html')])
      .filter(([, htmlPath]) => existsSync(htmlPath)),
  )
}

export default defineConfig({
  // GitHub project pages serve from /ATexamples/. `npm run dev` overrides this
  // to / so local URLs stay clean; a custom domain would too.
  base: process.env.BASE_PATH ?? '/ATexamples/',
  plugins: [react()],
  build: {
    // A three.js + drei + postprocessing bundle lands around 1.4 MB raw. That is
    // the floor for this kind of page, not a regression — don't chase the warning.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        ...exampleEntries(),
      },
    },
  },
})
