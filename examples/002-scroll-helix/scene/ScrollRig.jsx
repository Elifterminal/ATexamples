import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const projected = new THREE.Vector3()

// Smooths the raw scroll target, moves the camera along the helix, keeps a
// chosen world-width in frame at any aspect ratio, and projects the card anchors
// down to screen pixels for the DOM layer.
export function ScrollRig({ scroll, travel, visibleWidth, damping, content, margin, cards, cardRefs }) {
  const { camera, size } = useThree()

  useFrame((_, delta) => {
    const state = scroll.current
    const previous = state.current

    // Frame-rate independent smoothing. Without this the camera inherits every
    // stutter in the scroll events.
    state.current += (state.target - state.current) * Math.min(1, delta * damping)
    state.velocity = delta > 0 ? (state.current - previous) / delta : 0

    // Camera distance, fitted on BOTH axes.
    //
    // Fitting a world width alone was the original approach and it hides a trap:
    // the distance needed comes out inversely proportional to the aspect ratio,
    // so the wider the screen, the CLOSER the camera comes, and the less vertical
    // world stays in frame. Nothing ever checked the content still fit
    // top-to-bottom. On a 2:1 monitor that left 2.02 units of half-height for
    // panels reaching 2.4 — clipped by about ninety pixels, and the form filling
    // 72% of the frame with it.
    //
    // The other half of the trap is depth. The panels stand 1.75 units in front
    // of the helix, so they are nearer the camera and magnified relative to it —
    // the tallest content is also the closest. Fitting a height means asking, per
    // piece of content, how far back the camera has to be for THAT piece at ITS
    // depth, and taking the largest answer.
    //
    // The width fit still wins on narrow frames, which is why portrait is
    // unchanged — it reads well and this must not disturb it.
    const vFov = (camera.fov * Math.PI) / 180
    const tan = Math.tan(vFov / 2)
    const spanScale = THREE.MathUtils.clamp(camera.aspect / 1.6, 0.4, 1)

    const forWidth = (visibleWidth * spanScale) / 2 / (tan * camera.aspect)
    const forHeight = content.reduce(
      (needed, item) => Math.max(needed, (item.reach + margin) / tan + item.depth),
      0,
    )

    camera.position.set((state.current - 0.5) * travel, 0, Math.max(forWidth, forHeight, 3))
    camera.updateProjectionMatrix()

    // Cards live in the DOM — real links, real text, responsive for free — but
    // they're positioned from world space so they belong to the scene.
    cards.forEach((card, index) => {
      const el = cardRefs.current[index]
      if (!el) return

      projected.set(card.position[0], card.position[1], card.position[2]).project(camera)

      const x = (projected.x * 0.5 + 0.5) * size.width
      const y = (-projected.y * 0.5 + 0.5) * size.height
      const distance = Math.abs(card.position[0] - camera.position.x)

      // Fade with distance so cards arrive and leave rather than popping. This
      // is the seam that would otherwise be most obvious.
      const opacity = 1 - THREE.MathUtils.clamp((distance - visibleWidth * 0.22) / (visibleWidth * 0.3), 0, 1)

      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      el.style.opacity = opacity.toFixed(3)
      el.style.pointerEvents = opacity > 0.55 ? 'auto' : 'none'
      el.setAttribute('aria-hidden', opacity > 0.1 ? 'false' : 'true')
      el.tabIndex = opacity > 0.55 ? 0 : -1
    })
  })

  return null
}
