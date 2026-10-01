import * as THREE from 'three';
import { polyline } from './primitives';
import { detectorUnits, placement, radialPrism } from './detectorGeometry';
import { createCollision } from './collision';

// Structural reference: BESIII official longitudinal drawing; Huang et al.
// arXiv:2206.10117, figs. 7–9. Display segmentation is deliberately reduced;
// this is a cutaway illustration, not imported BOSS/GDML geometry.
export function createDetector() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const names = ['MDC', 'TOF', 'EMC', 'SOLENOID', 'MUC / YOKE'];
  const layers = names.map((name) => {
    const layer = new THREE.Group();
    layer.name = name;
    body.add(layer);
    return layer;
  });
  const tau = Math.PI * 2;
  // Open a broad sector towards the initial camera. Actual cut faces reveal
  // thickness; the remaining detector surfaces stay opaque and depth-tested.
  const cut = (angle: number) => {
    const wrapped = ((angle % tau) + tau) % tau;
    return wrapped > (5 * Math.PI) / 8 && wrapped < (11 * Math.PI) / 8;
  };
  const ring = (count: number, z: number) =>
    Array.from({ length: count }, (_, i) => {
      const angle = ((i + 0.5) / count) * tau;
      return cut(angle) ? null : placement(0, 0, z, angle);
    }).filter((m): m is THREE.Matrix4 => m !== null);

  // Chamber skin and end plates. A few structural ribs describe the volume
  // without drawing hundreds of crossing sense wires at thumbnail scale.
  detectorUnits(layers[0], radialPrism(0.77, 0.815, tau / 48, 2.58), ring(48, 0), '#71808b', 1, 0);
  for (const z of [-1.31, 1.31]) {
    detectorUnits(
      layers[0],
      radialPrism(0.09, 0.815, tau / 48, 0.065),
      ring(48, z),
      '#8c99a2',
      1,
      0
    );
  }
  detectorUnits(layers[0], radialPrism(0.73, 0.775, 0.025, 2.56), ring(12, 0), '#abb5bc', 1, 0);

  // Two TOF barrel layers and radial endcap counters. The visible seams are
  // geometry gaps, keeping light accents reserved for the important outlines.
  for (let layer = 0; layer < 2; layer++) {
    const radius = 0.845 + layer * 0.06;
    detectorUnits(
      layers[1],
      radialPrism(radius, radius + 0.042, (tau / 32) * 0.965, 2.3),
      ring(32, 0),
      layer ? '#55616c' : '#78838c',
      1,
      0
    );
  }
  for (const z of [-1.43, 1.43]) {
    detectorUnits(
      layers[1],
      radialPrism(0.42, 0.945, (tau / 32) * 0.96, 0.065),
      ring(32, z),
      '#65727c',
      1,
      0
    );
  }

  // CsI block volumes remain distinct, with restrained silver edges. These
  // coarse display cells do not claim to reproduce the actual crystal count.
  const crystals: THREE.Matrix4[] = [];
  for (let row = 0; row < 10; row++) crystals.push(...ring(32, (row - 4.5) * 0.277));
  detectorUnits(
    layers[2],
    radialPrism(0.985, 1.27, (tau / 32) * 0.97, 0.265),
    crystals,
    '#78808a',
    1,
    0.12
  );
  for (const z of [-1.65, 1.65]) {
    for (let row = 0; row < 3; row++) {
      const inner = 0.44 + row * 0.269;
      detectorUnits(
        layers[2],
        radialPrism(inner, inner + 0.256, (tau / 32) * 0.97, 0.23),
        ring(32, z),
        '#737d88',
        1,
        0.1
      );
    }
  }

  // Solenoid cryostat: an opaque machined shell and two thick retaining rims.
  detectorUnits(layers[3], radialPrism(1.45, 1.63, tau / 48, 3.5), ring(48, 0), '#3e4957', 1, 0);
  for (const z of [-1.77, 1.77]) {
    detectorUnits(layers[3], radialPrism(1.39, 1.69, tau / 48, 0.1), ring(48, z), '#98a4af', 1, 0);
  }

  // Octagonal steel return yoke and RPC gaps. Nine solid absorber plates give
  // the cut face its layered profile; internal plates do not carry wireframes.
  const yoke = layers[4];
  for (let layer = 0; layer < 9; layer++) {
    const apothem = 1.76 + layer * 0.092;
    const matrices: THREE.Matrix4[] = [];
    for (let face = 0; face < 8; face++) {
      const a = (face / 8) * tau;
      if (cut(a)) continue;
      matrices.push(placement(apothem * Math.cos(a), apothem * Math.sin(a), 0, a + Math.PI / 2));
    }
    const width = 2 * apothem * Math.tan(Math.PI / 8) - 0.025;
    detectorUnits(
      yoke,
      new THREE.BoxGeometry(width, 0.065, 4.1),
      matrices,
      layer === 8 ? '#45505e' : '#303b48',
      1,
      layer === 8 ? 0.32 : 0
    );
    if (layer < 8) {
      const rpc = matrices.map((m) =>
        m.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.046, 0))
      );
      detectorUnits(yoke, new THREE.BoxGeometry(width - 0.04, 0.013, 3.96), rpc, '#17232d', 1, 0);
    }
  }
  for (const side of [-1, 1]) {
    for (let layer = 0; layer < 8; layer++) {
      const cap = Array.from({ length: 8 }, (_, i) => (i * tau) / 8)
        .filter((a) => !cut(a))
        .map((a) => placement(0, 0, side * (2.14 + layer * 0.082), a));
      detectorUnits(
        yoke,
        radialPrism(0.48, 2.55 / Math.cos(Math.PI / 8), (Math.PI / 4) * 0.99, 0.055),
        cap,
        layer === 7 ? '#525e6b' : '#35414e',
        1,
        layer === 7 ? 0.32 : 0
      );
    }
  }

  // Grounded instrument support; no luminous plinth or projection cone.
  const supports = [placement(-1.42, -2.69, 0), placement(1.42, -2.69, 0)];
  detectorUnits(yoke, new THREE.BoxGeometry(0.28, 0.42, 3.6), supports, '#34414e', 1, 0.1);
  detectorUnits(
    yoke,
    new THREE.BoxGeometry(3.55, 0.13, 4.3),
    [placement(0, -2.94, 0)],
    '#43515f',
    1,
    0.18
  );

  // A continuous beam pipe would hide the collision at the centre. Two short
  // exposed sections terminate at the detector, leaving its cutaway legible.
  const pipe = new THREE.CylinderGeometry(0.045, 0.045, 1.15, 16);
  pipe.rotateX(Math.PI / 2);
  detectorUnits(layers[0], pipe, [placement(0, 0, -3.2), placement(0, 0, 3.2)], '#9caab4', 1, 0);

  // Pick out only the two exposed cryostat cut edges with cold-white trim.
  // Most shape definition comes from light on the solid, flat-shaded faces.
  for (const a of [(5 * Math.PI) / 8, (11 * Math.PI) / 8]) {
    const trim = polyline(
      [-1.75, 1.75].map((z) => new THREE.Vector3(1.64 * Math.cos(a), 1.64 * Math.sin(a), z)),
      '#e4edf4',
      0.8
    );
    trim.material.fog = false;
    layers[3].add(trim);
  }

  const event = createCollision();
  body.add(event.group);
  body.rotation.set(0.12, 1.05, -0.2);
  return {
    root,
    body,
    names,
    layers,
    vertices: event.vertices,
    eventState: event.group.userData,
    update: (time: number, tracks: boolean, camera: THREE.Camera, viewportHeight: number) => {
      event.group.visible = tracks;
      return event.update(time, camera, viewportHeight);
    },
  };
}
