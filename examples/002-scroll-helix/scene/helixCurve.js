import * as THREE from 'three'

// The helix as a formula. Because it's analytic rather than sampled, the same
// three lines drive the tube geometry on the CPU and the particle positions in
// the vertex shader — they can't drift out of sync.
//
// Runs along X so the form is horizontal.
export class HelixCurve extends THREE.Curve {
  constructor(radius, length, turns, phase) {
    super()

    this.radius = radius
    this.length = length
    this.turns = turns
    this.phase = phase
  }

  getPoint(t, target = new THREE.Vector3()) {
    const angle = t * this.turns * Math.PI * 2 + this.phase

    return target.set(
      (t - 0.5) * this.length,
      Math.sin(angle) * this.radius,
      Math.cos(angle) * this.radius,
    )
  }
}
