import { StrictMode, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Leva, useControls } from 'leva'
import { CATALOGUE } from './assets/index.js'
import { LightRig } from './assets/shared/LightRig.jsx'
import { Post } from './assets/shared/Post.jsx'
import './style.css'

// Eased rather than cut, so switching assets feels authored instead of like a
// slide deck.
function CameraRig({ distance }) {
  const { camera } = useThree()

  useFrame((_, delta) => {
    camera.position.z += (distance - camera.position.z) * Math.min(1, delta * 3.5)
  })

  return null
}

function Hud({ asset, index, total, onSelect }) {
  return (
    <div className="hud">
      <div className="hud-row">
        <span>001 — glass catalogue</span>
        <a href="../../">index</a>
      </div>

      <div className="hud-row hud-bottom">
        <div className="asset">
          <span className="asset-count dim">
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
          <h1>{asset.name}</h1>
          <p className="asset-line">{asset.line}</p>
          <p className="asset-geo dim">{asset.geometry}</p>
          <code className="asset-id">{asset.id}</code>
        </div>

        <nav className="catalogue" aria-label="Catalogue">
          {CATALOGUE.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              className="catalogue-item"
              aria-current={i === index}
              onClick={() => onSelect(i)}
            >
              <span className="catalogue-num">{String(i + 1).padStart(2, '0')}</span>
              {entry.name}
            </button>
          ))}
          <span className="dim hint">← → to browse</span>
        </nav>
      </div>
    </div>
  )
}

function App() {
  const [index, setIndex] = useState(0)
  const asset = CATALOGUE[index]

  const { background } = useControls('world', { background: '#07080c' })

  const step = useCallback((delta) => {
    setIndex((current) => (current + delta + CATALOGUE.length) % CATALOGUE.length)
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  return (
    <>
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 2]} gl={{ antialias: false }}>
        <color attach="background" args={[background]} />
        <CameraRig distance={asset.distance} />
        {/* Scoped per asset — Leva persists values by control path, so a shared
            "light" folder would hand the next asset the previous one's numbers */}
        <LightRig
          key={asset.id}
          scope={asset.id}
          defaults={asset.light}
          base={asset.light?.base !== false}
        >
          {asset.Lights ? <asset.Lights /> : null}
        </LightRig>
        <asset.Component />
        <Post />
      </Canvas>

      <Hud asset={asset} index={index} total={CATALOGUE.length} onSelect={setIndex} />
      <Leva titleBar={{ title: `001 · ${asset.id}` }} collapsed />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
