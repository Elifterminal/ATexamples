import * as THREE from 'three'

// The orbital motion, shared by everything that hangs in the sheath around the
// form — the dust and the hex plates, and whatever comes next.
//
// This is one copy on purpose. "The plates behave the same way as the dust" is a
// requirement, and two hand-kept copies of a motion model will drift apart the
// first time one of them is tuned. Sharing the actual GLSL makes sameness
// structural rather than something to remember.

// Declared once and pasted into every shader that samples the orbit. Each shader
// adds its own uniforms after these.
export const ORBIT_GLSL = /* glsl */ `
  uniform float uOrbit;
  uniform float uDrift;
  uniform float uTime;
  uniform float uCalm;
  uniform float uSpan;
  uniform float uInner;
  uniform float uShell;
  uniform float uTurbulence;
  uniform float uBillow;
  uniform float uWander;

  attribute float aAxis;
  attribute float aAngle;
  attribute float aShell;
  attribute float aSpin;
  attribute float aDrag;
  attribute float aSeed;
  attribute float aSize;

  struct Orbit {
    vec3 pos;
    vec3 shellNormal;
    float fade;
  };

  Orbit sampleOrbit() {
    // Scroll shifts every particle along the axis and fract() wraps it, so the
    // volume can never be emptied out by scrolling far in one direction. aDrag
    // varies per particle — without that spread the whole sheath slides as one
    // rigid block, which reads as a moving object rather than as a medium.
    float axis = fract(aAxis + uDrift * aDrag);
    float x = (axis - 0.5) * uSpan;

    // Signed spin. Some go one way, some the other, so the sheath churns through
    // itself instead of turning like a wheel.
    float angle = aAngle + uOrbit * aSpin;

    // Three cheap out-of-phase waves standing in for turbulence. Real curl noise
    // is the right answer and costs more than it's worth at this density.
    float seed = aSeed * 6.283185307179586;
    float n1 = sin(x * 0.31 + uTime * 0.61 + seed);
    float n2 = sin(angle * 1.7 - uTime * 0.44 + seed * 1.7);
    float n3 = sin(x * 0.17 - uTime * 0.29 + seed * 2.3);

    // Every turbulence term is gated by uCalm, which is 0 while the scroll is
    // moving and eases to 1 once it stops. Driven, the sheath streams; let go,
    // it breaks up and wanders. That contrast is the effect.
    angle += (n1 * 0.6 + n2 * 0.35) * uTurbulence * uCalm;

    // Billow moves through the thickness of the sheath rather than scaling the
    // radius. Scaling let a particle at the inner edge get pushed 22% inward —
    // straight through the glass wall it is supposed to be orbiting outside of.
    // Displacing the shell fraction makes the clearance structural: radius can't
    // leave [uInner, uInner + uShell] whatever the noise does. Reflected at both
    // ends, not clamped, because a clamp piles particles into a bright ring right
    // at the glass, which is where the eye already is.
    float s = abs(aShell + (n2 * 0.5 + n3 * 0.5) * uBillow * uCalm);
    s = 1.0 - abs(1.0 - s);

    float radius = uInner + s * uShell;
    x += n3 * uWander * uCalm;

    Orbit o;
    o.shellNormal = vec3(0.0, sin(angle), cos(angle));
    o.pos = vec3(x, o.shellNormal.y * radius, o.shellNormal.z * radius);

    // The wrap seam. Particles recycling from one end to the other would pop in
    // at full brightness right at the edge of frame, so they fade across the
    // last eighth at each end instead.
    o.fade = smoothstep(0.0, 0.12, axis) * smoothstep(1.0, 0.88, axis);

    return o;
  }
`

export function mulberry32(seed) {
  let state = seed

  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0

    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The per-particle constants the shared GLSL reads. Returned as plain typed
// arrays so the caller can wrap them as ordinary or instanced attributes.
export function orbitAttributes(count, { counter, seed = 907, radialBias = 1.6 }) {
  const random = mulberry32(seed)

  const axis = new Float32Array(count)
  const angle = new Float32Array(count)
  const shell = new Float32Array(count)
  const spin = new Float32Array(count)
  const drag = new Float32Array(count)
  const noise = new Float32Array(count)
  const size = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    axis[i] = random()
    angle[i] = random() * Math.PI * 2

    // Biased inward rather than uniform through the shell, so the sheath is
    // densest against the glass and thins outward. Uniform reads as a tube of
    // fog the form happens to sit inside.
    shell[i] = random() ** radialBias

    spin[i] = (random() < counter ? -1 : 1) * (0.4 + random() * 1.0)
    drag[i] = 0.55 + random() * 0.9
    noise[i] = random()
    size[i] = 0.5 + random() * 1.1
  }

  return { axis, angle, shell, spin, drag, seed: noise, size, random }
}

export function applyOrbitAttributes(geometry, attributes, Attribute = THREE.BufferAttribute) {
  geometry.setAttribute('aAxis', new Attribute(attributes.axis, 1))
  geometry.setAttribute('aAngle', new Attribute(attributes.angle, 1))
  geometry.setAttribute('aShell', new Attribute(attributes.shell, 1))
  geometry.setAttribute('aSpin', new Attribute(attributes.spin, 1))
  geometry.setAttribute('aDrag', new Attribute(attributes.drag, 1))
  geometry.setAttribute('aSeed', new Attribute(attributes.seed, 1))
  geometry.setAttribute('aSize', new Attribute(attributes.size, 1))
}

export function orbitUniforms({ span, inner, shell, turbulence, billow, wander }) {
  return {
    uOrbit: { value: 0 },
    uDrift: { value: 0 },
    uTime: { value: 0 },
    uCalm: { value: 1 },
    uSpan: { value: span },
    uInner: { value: inner },
    uShell: { value: shell },
    uTurbulence: { value: turbulence },
    uBillow: { value: billow },
    uWander: { value: wander },
  }
}

export function createOrbitState() {
  return { orbit: 0, drift: 0, time: 0, calm: 1 }
}

// One update, used by every system in the sheath, so they can't fall out of step
// with each other or with the scroll.
export function advanceOrbit(state, delta, velocity, { orbit, orbitSurge, follow, settle }) {
  const speed = Math.abs(velocity)

  state.time += delta

  // Orbit never stops — scroll only adds to it. Tie it to scroll alone and the
  // sheath dies in the user's hands the moment they stop moving.
  state.orbit += delta * (orbit + speed * orbitSurge)

  // Signed, so the sheath is dragged the way the scroll went rather than just
  // agitated by it.
  state.drift += delta * velocity * follow

  // Eased, not switched. Snapping turbulence on the frame the wheel stops is
  // instantly readable as a state change; arriving over half a second reads as
  // the medium settling.
  const target = 1 - Math.min(1, speed * 2.5)
  state.calm += (target - state.calm) * Math.min(1, delta * settle)

  return state
}

export function writeOrbitUniforms(u, state, { span, inner, shell, turbulence, billow, wander }) {
  u.uOrbit.value = state.orbit
  u.uDrift.value = state.drift
  u.uTime.value = state.time
  u.uCalm.value = state.calm
  u.uSpan.value = span
  u.uInner.value = inner
  u.uShell.value = shell
  u.uTurbulence.value = turbulence
  u.uBillow.value = billow
  u.uWander.value = wander
}
