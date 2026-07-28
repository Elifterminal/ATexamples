import { useMemo } from 'react'
import * as THREE from 'three'

// One light direction, shared by the environment strips, the lamp that makes the
// specular streak, the shading on the glass core, and both particle systems.
//
// This file exists because the scene was lit four separate ways and therefore
// looked lit from nowhere. A form only reads as lit from above if everything
// covering it agrees on where above is — and the particles cover most of it.
export const KEY = '#fff0d8'
export const BOUNCE = '#3f5f9c'
export const SPARK = '#fff6e6'

// Elevation and azimuth in degrees rather than a raw vector, because those are
// the two things worth dragging a slider on. 90° elevation is straight overhead;
// azimuth 0 points the light at the camera, positive swings it to the right.
export function directionFrom(elevation, azimuth) {
  const el = THREE.MathUtils.degToRad(elevation)
  const az = THREE.MathUtils.degToRad(azimuth)

  return new THREE.Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  ).normalize()
}

// Memoised on the two numbers, not on the vector. A fresh Vector3 every render
// would invalidate every geometry that shades itself against it.
export function useLightDirection(elevation, azimuth) {
  return useMemo(() => directionFrom(elevation, azimuth), [elevation, azimuth])
}

// Half-lambert rather than clamped lambert, everywhere. A hard clamp puts the
// underside at dead black, which reads as a hole cut in the form; wrapping the
// falloff keeps the shadow side present but clearly unlit, which is what a
// scattering medium actually does.
export const HALF_LAMBERT = /* glsl */ `
  float halfLambert(vec3 n, vec3 lightDir, float ambient, float contrast) {
    float lam = dot(n, lightDir) * 0.5 + 0.5;
    return ambient + (1.0 - ambient) * pow(lam, contrast);
  }
`
