import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'

// Deterministic noise. An asset should look the same every load — a lottery on
// refresh isn't something you can art-direct or hand to someone as a template.
function mulberry32(seed) {
  let state = seed

  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0

    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Radial fibres, instanced. One box geometry drawn N times with a different
// matrix each — this is the "instanced structure along a path" technique, and
// it's what gets you organic detail without authoring geometry.
function Fibres({ count, seed, inner, outer, color, spread, emissive }) {
  const mesh = useRef()

  useLayoutEffect(() => {
    const random = mulberry32(seed)
    const dummy = new THREE.Object3D()
    const tint = new THREE.Color()
    const base = new THREE.Color(color)

    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.05
      const start = inner + random() * 0.03
      const end = outer - random() * (outer - inner) * spread
      const length = Math.max(end - start, 0.02)
      const mid = start + length / 2

      dummy.position.set(Math.cos(angle) * mid, Math.sin(angle) * mid, (random() - 0.5) * 0.012)
      dummy.rotation.set(0, 0, angle)
      dummy.scale.set(length, 0.004 + random() * 0.013, 0.015 + random() * 0.03)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)

      // Per-fibre brightness. The variation is what stops it reading as a decal.
      tint.copy(base).multiplyScalar(0.55 + random() * 0.75)
      mesh.current.setColorAt(i, tint)
    }

    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
  }, [count, seed, inner, outer, color, spread])

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      {/* Deliberately NOT a transmission material. Transmission forces its own
          full-scene render pass, and these sit inside the orb's transmission
          pass — nesting them tanks the frame. Clearcoat + iridescence reads as
          glass here because the orb in front is doing the actual refracting. */}
      {/* Emissive matters more than it looks like it should. Glass shows you
          what's behind it, and against a black background that's nothing — the
          iris has to supply its own light or the orb just reads as a dark ball. */}
      <meshPhysicalMaterial
        color={color}
        emissive={color}
        emissiveIntensity={emissive}
        roughness={0.15}
        metalness={0.15}
        clearcoat={1}
        clearcoatRoughness={0.1}
        iridescence={0.45}
        iridescenceIOR={1.6}
      />
    </instancedMesh>
  )
}

export function Iris({
  radius,
  pupil,
  fibreCount,
  seed,
  color,
  backing,
  limbal,
  spread,
  glow,
  emissive,
}) {
  return (
    <group>
      {/* Backing gives the fibres something to sit against and keeps the pupil black */}
      <mesh position={[0, 0, -0.03]}>
        <circleGeometry args={[radius, 96]} />
        <meshStandardMaterial color={backing} roughness={0.6} metalness={0.2} />
      </mesh>

      <Fibres
        key={`${fibreCount}-${seed}`}
        count={fibreCount}
        seed={seed}
        inner={pupil + 0.02}
        outer={radius}
        color={color}
        spread={spread}
        emissive={emissive}
      />

      {/* Limbal ring — the dark band at the iris edge. Cheap, and its absence is
          the main reason a rendered eye reads as fake. */}
      <mesh>
        <torusGeometry args={[radius, 0.022, 16, 128]} />
        <meshStandardMaterial color={limbal} roughness={0.4} metalness={0.3} />
      </mesh>

      <mesh position={[0, 0, 0.035]}>
        <circleGeometry args={[pupil, 64]} />
        <meshStandardMaterial color="#000000" roughness={1} />
      </mesh>

      {/* A faint disc behind everything, so light seems to come from within */}
      <mesh position={[0, 0, -0.06]}>
        <circleGeometry args={[radius * 0.92, 64]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={glow}
          roughness={1}
        />
      </mesh>
    </group>
  )
}
