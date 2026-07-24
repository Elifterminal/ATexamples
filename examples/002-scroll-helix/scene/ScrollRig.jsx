import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const projected = new THREE.Vector3()

// Smooths the raw scroll target, moves the camera along the helix, keeps a
// chosen world-width in frame at any aspect ratio, and projects the card anchors
// down to screen pixels for the DOM layer.
export function ScrollRig({ scroll, travel, visibleWidth, damping, cards, cardRefs }) {
  const { camera, size } = useThree()

  useFrame((_, delta) => {
    const state = scroll.current
    const previous = state.current

    // Frame-rate independent smoothing. Without this the camera inherits every
    // stutter in the scroll events.
    state.current += (state.target - state.current) * Math.min(1, delta * damping)
    state.velocity = delta > 0 ? (state.current - previous) / delta : 0

    // Camera distance from aspect, so the composition is intentional on an
    // ultrawide and on a phone rather than merely cropped.
    //
    // Fitting a FIXED world-width is not enough on its own: on a narrow frame it
    // pushes the camera so far back the helix becomes a thread in empty space.
    // So the span narrows with the aspect too — fewer turns on screen, at a size
    // that still reads. This mitigates portrait; it does not solve it. The real
    // answer is a rotated vertical variant.
    const vFov = (camera.fov * Math.PI) / 180
    const spanScale = THREE.MathUtils.clamp(camera.aspect / 1.6, 0.4, 1)
    const fit = (visibleWidth * spanScale) / 2 / (Math.tan(vFov / 2) * camera.aspect)

    camera.position.set((state.current - 0.5) * travel, 0, Math.max(fit, 3))
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
