import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshTransmissionMaterial } from "@react-three/drei";
import { mulberry32 } from "./orbit.js";

// The glass behind the cards.
//
// The cards themselves stay real DOM anchors — that was the useful finding from
// this example and it is not worth giving back for a material. So the panel is
// WebGL and the text rides on top of it in the DOM. What that buys: actual
// refraction, an edge that bends the form behind it, and a surface that answers
// the same light as everything else. What it costs: the flakes can pass in front
// of the panel but never in front of the text.
//
// All five panels are merged into ONE geometry, the same trick the helix uses
// for its two strands. MeshTransmissionMaterial re-renders the whole scene into
// a buffer every frame, so five separate panels would mean five extra full scene
// renders per frame on top of the one the tube already costs.
function roundedRect(width, height, radius) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);

  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w, h - r);
  shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w + r, h);
  shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w, -h + r);
  shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);

  return shape;
}

// Procedural, because nothing here loads an external asset. Fine grain with a
// faint drawn streak through it — a perfectly uniform surface is what makes CG
// glass read as a shader rather than as a panel someone could pick up.
function grainTexture(size, strength) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(size, size);
  const random = mulberry32(4211);

  for (let y = 0; y < size; y += 1) {
    // The streaks run vertically and are much lower frequency than the grain,
    // so they read as the way the sheet was drawn rather than as noise.
    const streak = Math.sin(y * 0.11) * 0.5 + Math.sin(y * 0.037) * 0.5;

    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const grain = random() - 0.5;
      const value = 128 + (grain * 0.75 + streak * 0.25) * 255 * strength;

      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  return texture;
}

export function CardPanels({
  positions,
  width,
  height,
  depth,
  radius,
  bevel,
  resolution,
  ior,
  roughness,
  transmission,
  thickness,
  chroma,
  distortion,
  tint,
  grain,
  grainScale,
  rim,
  rimGlow,
}) {
  const geometry = useMemo(() => {
    const shape = roundedRect(width, height, radius);

    const panels = positions.map((position) => {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        // A bevel is most of why this reads as a slab rather than a decal. It
        // gives the rim a surface at an angle to the face, so the edge picks up
        // the key and bends what is behind it instead of stopping dead.
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 3,
        curveSegments: 8,
      });

      geo.center();
      geo.translate(position[0], position[1], position[2]);

      return geo;
    });

    const merged = mergeGeometries(panels);
    panels.forEach((panel) => panel.dispose());

    return merged;
  }, [positions, width, height, depth, radius, bevel]);

  // The edge, as its own flat ring sitting just proud of the front face.
  //
  // Clear glass on a near-black background has nothing to reflect, so it reads
  // as a smudge rather than as an object — the debug pass showed a panel exactly
  // where it should be and almost invisible once the material went back on. A
  // real panel is found by its edges first, so the edge is drawn rather than
  // left to the material to imply.
  const rimGeometry = useMemo(() => {
    if (rim <= 0) return null;

    const front = depth / 2 + bevel;

    const rings = positions.map((position) => {
      const outer = roundedRect(width, height, radius);
      outer.holes.push(
        roundedRect(
          width - rim * 2,
          height - rim * 2,
          Math.max(0.001, radius - rim),
        ),
      );

      const geo = new THREE.ShapeGeometry(outer, 12);
      geo.translate(position[0], position[1], position[2] + front + 0.004);

      return geo;
    });

    const merged = mergeGeometries(rings);
    rings.forEach((ring) => ring.dispose());

    return merged;
  }, [positions, width, height, radius, rim, depth, bevel]);

  const texture = useMemo(() => grainTexture(256, grain), [grain]);

  useEffect(() => {
    texture.repeat.set(grainScale, grainScale);
    texture.needsUpdate = true;
  }, [texture, grainScale]);

  // The leak this project has now paid for twice. Geometry and textures both
  // hold GPU memory that useMemo will happily strand on every slider drag.
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => rimGeometry?.dispose(), [rimGeometry]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <>
      <mesh geometry={geometry} frustumCulled={false}>
        <MeshTransmissionMaterial
          samples={4}
          resolution={resolution}
          transmission={transmission}
          thickness={thickness}
          ior={ior}
          roughness={roughness}
          roughnessMap={texture}
          chromaticAberration={chroma}
          anisotropicBlur={0.1}
          distortion={distortion}
          distortionScale={0.4}
          temporalDistortion={0.02}
          clearcoat={0.8}
          clearcoatRoughness={0.08}
          attenuationColor={tint}
          attenuationDistance={2.4}
          backside={false}
        />
      </mesh>

      {rimGeometry ? (
        <mesh geometry={rimGeometry} frustumCulled={false}>
          <meshBasicMaterial
            color={tint}
            transparent
            opacity={rimGlow}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
    </>
  );
}
