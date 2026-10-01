import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import {
  flightTrack,
  collisionPhase,
  COLLISION_TIMING,
  teachingEvent,
  type Vec3,
} from '@/lib/reading/universe/collision';
import { textMesh } from './primitives';

export function createCollision() {
  const group = new THREE.Group();
  const content = new THREE.Group();
  group.add(content);
  const labels: {
    mesh: ReturnType<typeof textMesh>;
    anchor: THREE.Vector3;
    offset: THREE.Vector2;
  }[] = [];
  const markers: { mesh: THREE.Mesh; radius: number; pixels: number }[] = [];
  const dashedLines: { line: Line2; midpoint: THREE.Vector3 }[] = [];
  const zero = new THREE.Vector3();
  const signalColor = '#30efff';
  const positronColor = '#ffd66c';
  const tagColor = '#8497aa';
  const { beamEnd, flashEnd, pairEnd, decayEnd } = COLLISION_TIMING;
  const progress = (t: number, start: number, end: number) =>
    THREE.MathUtils.clamp((t - start) / (end - start), 0, 1);
  const fadeIn = (t: number, start: number, end: number) =>
    THREE.MathUtils.smoothstep(t, start, end);

  // Crisp, unlit event glyphs remain readable through the rotating cutaway.
  // They are a teaching overlay, not light emitted by particles in the detector.
  function glyph(geometry: THREE.BufferGeometry, color: string) {
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      })
    );
    mesh.renderOrder = 40;
    content.add(mesh);
    return mesh;
  }
  function marker(geometry: THREE.BufferGeometry, color: string, radius: number, pixels: number) {
    const mesh = glyph(geometry, color);
    markers.push({ mesh, radius, pixels });
    return mesh;
  }
  function lineMaterial(color: string, width: number, dashed = false) {
    const material = new LineMaterial({
      color,
      worldUnits: false,
      dashed,
      dashSize: 6,
      gapSize: 5,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    material.linewidth = width;
    return material;
  }
  // A sharp colored border around a cold white core stays legible over metal.
  // Pixel widths prevent magnified tracks from becoming opaque pipes.
  function segment(color: string, width = 3.4, coreWidth = 1.25, opacity = 1) {
    const geometry = new LineGeometry().setPositions([0, 0, 0, 0, 0, 0.001]);
    const mesh = new THREE.Group();
    const edge = new Line2(geometry, lineMaterial(color, width));
    const core = new Line2(geometry, lineMaterial('#f6fcff', coreWidth));
    edge.material.opacity = core.material.opacity = opacity;
    edge.renderOrder = 31;
    core.renderOrder = 32;
    edge.frustumCulled = core.frustumCulled = false;
    mesh.add(edge, core);
    content.add(mesh);
    return {
      mesh,
      materials: [edge.material, core.material],
      set: (start: THREE.Vector3, end: THREE.Vector3) => {
        const starts = geometry.getAttribute('instanceStart');
        const ends = geometry.getAttribute('instanceEnd');
        starts.setXYZ(0, start.x, start.y, start.z);
        ends.setXYZ(0, end.x, end.y, end.z);
        starts.needsUpdate = ends.needsUpdate = true;
      },
    };
  }
  function label(
    text: string,
    color: string,
    position: THREE.Vector3,
    width = 1,
    offset = new THREE.Vector2(0, 14)
  ) {
    const mesh = textMesh(text, color, 0.32, width, 600);
    mesh.position.copy(position);
    mesh.material.fog = false;
    mesh.material.depthTest = false;
    mesh.renderOrder = 50;
    content.add(mesh);
    labels.push({ mesh, anchor: position.clone(), offset });
    return mesh;
  }
  function dashed(start: THREE.Vector3, end: THREE.Vector3, color: string) {
    const line = new Line2(
      new LineGeometry().setPositions([...start.toArray(), ...end.toArray()]),
      lineMaterial(color, 2.2, true)
    );
    line.computeLineDistances();
    line.renderOrder = 30;
    line.frustumCulled = false;
    content.add(line);
    dashedLines.push({ line, midpoint: start.clone().lerp(end, 0.5) });
    return line;
  }
  function growDash(line: Line2, end: THREE.Vector3) {
    const start = line.geometry.getAttribute('instanceStart');
    const attribute = line.geometry.getAttribute('instanceEnd');
    attribute.setXYZ(0, end.x, end.y, end.z);
    attribute.needsUpdate = true;
    // computeLineDistances replaces its GPU buffer; mutate this single segment's
    // distance instead so an indefinitely running loop keeps the same buffers.
    const distance = line.geometry.getAttribute('instanceDistanceEnd');
    distance.setX(
      0,
      Math.hypot(end.x - start.getX(0), end.y - start.getY(0), end.z - start.getZ(0))
    );
    distance.needsUpdate = true;
  }

  const beams = [-1, 1].map((sign, i) => {
    const color = i ? '#b8c8df' : '#e8f4fa';
    const head = marker(new THREE.OctahedronGeometry(0.06), color, 0.06, 3.1);
    const stroke = segment(color, 2.7, 1.25);
    const caption = label(i ? 'e⁺' : 'e⁻', color, new THREE.Vector3(0, 0, sign * 3.1));
    const captionAnchor = labels[labels.length - 1].anchor;
    return { sign, head, stroke, caption, captionAnchor };
  });
  const flash = marker(new THREE.OctahedronGeometry(0.14), '#ffffff', 0.14, 7.5);
  const resonance = label('ψ(3770)', '#edf5fa', zero, 1.5, new THREE.Vector2(0, 20));
  const event = teachingEvent();
  const direction = new THREE.Vector3(...event.d.p).normalize();
  // Intentionally enlarged flight lengths separate the two decay vertices.
  const vertices = [
    direction.clone().multiplyScalar(0.64),
    direction.clone().multiplyScalar(-0.56),
  ];
  const parents = vertices.map((v, i) => {
    const color = i ? tagColor : signalColor;
    const line = dashed(zero, v, color);
    const dot = marker(new THREE.OctahedronGeometry(0.065), color, 0.065, 3.7);
    const caption = label(
      i ? 'D̄⁰' : 'D⁰',
      color,
      v,
      0.7,
      new THREE.Vector2(i ? -17 : 17, i ? -17 : 17)
    );
    const vertexEdge = marker(new THREE.OctahedronGeometry(0.09), color, 0.09, 5.4);
    vertexEdge.position.copy(v);
    const vertex = marker(new THREE.OctahedronGeometry(0.07), '#ffffff', 0.07, 3.1);
    vertex.renderOrder = 41;
    vertex.position.copy(v);
    if (i) {
      line.material.linewidth = 1.5;
      line.material.opacity = 0.45;
      [dot, caption, vertex, vertexEdge].forEach((mesh) => {
        mesh.material.opacity = 0.5;
      });
    }
    return { line, dot, caption, vertex, vertexEdge, v };
  });

  const particles = [
    {
      momentum: event.signal.hadronicSystem,
      name: 'X',
      kind: 'hadronic-system' as const,
      color: signalColor,
    },
    {
      momentum: event.signal.positron,
      name: 'e⁺',
      kind: 'positron' as const,
      color: positronColor,
    },
    ...event.tag.map((momentum, i) => ({
      momentum,
      name: i ? 'π⁻' : 'K⁺',
      kind: 'tag' as const,
      color: tagColor,
    })),
  ];
  // X represents the combined hadronic momentum, not a named particle track.
  // Use a common vector scale for D, X, e+ and missing momentum, rather than
  // assigning each signal branch an unrelated detector-boundary length.
  const momentumScale = vertices[0].length() / Math.hypot(...event.d.p);
  const daughters = particles.map(({ momentum, name, kind, color }, i) => {
    const isTag = kind === 'tag';
    const isPositron = kind === 'positron';
    const origin = vertices[isTag ? 1 : 0];
    let end = origin.clone().addScaledVector(new THREE.Vector3(...momentum.p), momentumScale);
    if (isTag) {
      for (let distance = 0.012; distance <= 3; distance += 0.012) {
        end = new THREE.Vector3(...flightTrack(origin.toArray() as Vec3, momentum.p, distance));
        if (Math.hypot(end.x, end.y) >= 1.24 || Math.abs(end.z) >= 1.65) break;
      }
    }
    const stroke = segment(
      color,
      isTag ? 1.8 : isPositron ? 4.6 : 3.4,
      isTag ? 0.65 : isPositron ? 1.9 : 1.25,
      isTag ? 0.45 : 1
    );
    const head = marker(
      new THREE.OctahedronGeometry(0.05),
      color,
      0.05,
      isTag ? 2.1 : isPositron ? 4.2 : 3.4
    );
    const caption = label(
      name,
      color,
      end,
      0.55,
      new THREE.Vector2(isTag ? -7 : 7, i % 2 ? -14 : 14)
    );
    const captionAnchor = labels[labels.length - 1].anchor;
    if (isTag) {
      [head, caption].forEach((mesh) => {
        mesh.material.opacity = 0.5;
      });
    }
    return {
      origin,
      end,
      stroke,
      head,
      caption,
      captionAnchor,
      kind,
      start: pairEnd + (isTag ? 0.45 : 0),
    };
  });
  const missingEnd = vertices[0]
    .clone()
    .addScaledVector(new THREE.Vector3(...event.signal.neutrino.p), momentumScale);
  const missing = dashed(vertices[0], missingEnd, '#c5d9e9');
  missing.material.linewidth = 1.8;
  const missingLabel = label(
    'νₑ · missing p',
    '#d5e3ee',
    missingEnd,
    1.55,
    new THREE.Vector2(0, -14)
  );
  const missingLabelAnchor = labels[labels.length - 1].anchor;
  const movingPoint = new THREE.Vector3();
  const tailPoint = new THREE.Vector3();
  const inverse = new THREE.Quaternion();
  const facing = new THREE.Quaternion();
  const projection = new THREE.Matrix4();
  const clipOrigin = new THREE.Vector4();
  const clipDirection = new THREE.Vector4();
  const worldScale = new THREE.Vector3();
  const billboardRight = new THREE.Vector3();
  const billboardUp = new THREE.Vector3();
  const cameraPoint = new THREE.Vector4();
  const modelView = new THREE.Matrix4();
  const projectedStart = new THREE.Vector3();
  const projectedEnd = new THREE.Vector3();
  // Preserve each glyph's authored contrast. Reset from these values every
  // frame so fading never compounds, including when scrubbing backwards.
  const baseOpacities = new Map<THREE.Material, number>();
  content.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => baseOpacities.set(material, material.opacity));
  });
  // Intersect each beam-axis ray with the view boundary. Incoming bunches
  // therefore enter from the edges of their own viewport, including after zoom.
  function beamExtent(sign: number) {
    clipOrigin.set(0, 0, 0, 1).applyMatrix4(projection);
    clipDirection.set(0, 0, sign, 0).applyMatrix4(projection);
    let distance = Infinity;
    for (const axis of ['x', 'y'] as const) {
      for (const edge of [-1, 1]) {
        const denominator = clipDirection[axis] - edge * clipDirection.w;
        if (Math.abs(denominator) < 1e-6) continue;
        const t = (edge * clipOrigin.w - clipOrigin[axis]) / denominator;
        if (t > 0 && clipOrigin.w + t * clipDirection.w > 0.1) {
          distance = Math.min(distance, t);
        }
      }
    }
    // Looking directly along the beam axis has no side-edge intersection.
    return Number.isFinite(distance) ? Math.min(distance, 60) : 8;
  }

  function update(time: number, camera: THREE.Camera, viewportHeight = 320) {
    const { time: t, stage, clearing, opacity } = collisionPhase(time);
    content.visible = !clearing;
    const setOpacity = (material: THREE.Material, factor = 1) => {
      material.opacity = (baseOpacities.get(material) ?? 1) * opacity * factor;
    };
    baseOpacities.forEach((_, material) => setOpacity(material));
    group.updateWorldMatrix(true, false);
    projection
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .multiply(group.matrixWorld);
    modelView.multiplyMatrices(camera.matrixWorldInverse, group.matrixWorld);
    group.getWorldScale(worldScale);
    // Keep labels and vertex symbols a useful screen size at any magnification.
    // Both perspective and orthographic cameras are supported through clip w.
    const unitsPerPixel = (position: THREE.Vector3) => {
      cameraPoint.set(position.x, position.y, position.z, 1).applyMatrix4(modelView);
      cameraPoint.applyMatrix4(camera.projectionMatrix);
      return (
        (2 * Math.max(Math.abs(cameraPoint.w), 0.001)) /
        (camera.projectionMatrix.elements[5] * Math.max(viewportHeight, 1) * worldScale.y)
      );
    };
    beams.forEach(({ sign, head, stroke, caption, captionAnchor }) => {
      const u = progress(t, 0, beamEnd);
      const extent = beamExtent(sign);
      head.position.set(0, 0, sign * extent * (1 - u));
      tailPoint.set(0, 0, head.position.z + sign * 0.68);
      stroke.set(head.position, tailPoint);
      captionAnchor.set(0, 0, sign * Math.min(3.1, extent * 0.7));
      head.visible = stroke.mesh.visible = caption.visible = t < beamEnd;
      const beamOpacity = 1 - fadeIn(t, beamEnd - 0.12, beamEnd);
      setOpacity(head.material, beamOpacity);
      setOpacity(caption.material, beamOpacity);
      stroke.materials.forEach((material) => setOpacity(material, beamOpacity));
    });
    flash.visible = resonance.visible = t >= beamEnd && t < flashEnd + 0.16;
    const flashOpacity = 1 - fadeIn(t, beamEnd, flashEnd + 0.16);
    setOpacity(flash.material, flashOpacity);
    setOpacity(resonance.material, flashOpacity);
    parents.forEach(({ line, dot, caption, vertex, vertexEdge, v }, i) => {
      const decayStart = pairEnd + (i ? 0.45 : 0);
      const u = progress(t, flashEnd, decayStart);
      dot.position.copy(v).multiplyScalar(u);
      line.visible = t > flashEnd;
      caption.visible = t >= flashEnd;
      dot.visible = t >= flashEnd && t < decayStart + 0.2;
      vertex.visible = vertexEdge.visible = t >= decayStart;
      const parentOpacity = fadeIn(t, flashEnd, flashEnd + 0.2);
      setOpacity(line.material, parentOpacity);
      setOpacity(caption.material, parentOpacity);
      setOpacity(
        dot.material,
        parentOpacity * (1 - fadeIn(t, decayStart - 0.08, decayStart + 0.2))
      );
      const vertexOpacity = fadeIn(t, decayStart, decayStart + 0.25);
      setOpacity(vertex.material, vertexOpacity);
      setOpacity(vertexEdge.material, vertexOpacity);
      growDash(line, dot.position);
    });
    const viewportWidth =
      (viewportHeight * camera.projectionMatrix.elements[5]) / camera.projectionMatrix.elements[0];
    // On deep zoom the calorimeter endpoints leave the view. Keep particle
    // names on their own trajectories near the vertex being inspected.
    const anchorNearVertex = (
      anchor: THREE.Vector3,
      origin: THREE.Vector3,
      end: THREE.Vector3,
      pixelDistance: number
    ) => {
      projectedStart.copy(origin).applyMatrix4(projection);
      projectedEnd.copy(end).applyMatrix4(projection);
      const length = Math.hypot(
        (projectedEnd.x - projectedStart.x) * viewportWidth * 0.5,
        (projectedEnd.y - projectedStart.y) * viewportHeight * 0.5
      );
      anchor.copy(origin).lerp(end, Math.min(1, pixelDistance / Math.max(length, 0.001)));
    };
    daughters.forEach(({ origin, end, captionAnchor }) => {
      const distance = Math.min(115, viewportHeight * 0.36);
      anchorNearVertex(captionAnchor, origin, end, distance);
    });
    anchorNearVertex(
      missingLabelAnchor,
      vertices[0],
      missingEnd,
      Math.min(145, viewportHeight * 0.44)
    );
    daughters.forEach(({ origin, end, stroke, head, caption, kind, start }) => {
      // No endpoint replacement or clamping: the head keeps flying at the same
      // speed during readout and fade, leaving its full straight trail behind.
      const u = Math.max(0, (t - start) / (decayEnd - start));
      movingPoint.copy(origin).lerp(end, u);
      stroke.set(origin, movingPoint);
      stroke.mesh.visible = t > start;
      head.visible = t >= start;
      head.position.copy(movingPoint);
      caption.visible = t >= start + 0.8 && kind !== 'tag';
      const daughterOpacity = fadeIn(t, start, start + 0.24);
      setOpacity(head.material, daughterOpacity);
      stroke.materials.forEach((material) => setOpacity(material, daughterOpacity));
      setOpacity(caption.material, fadeIn(t, start + 0.8, start + 1.2));
    });
    const missingProgress = Math.max(0, (t - pairEnd) / (decayEnd - pairEnd));
    movingPoint.copy(vertices[0]).lerp(missingEnd, missingProgress);
    growDash(missing, movingPoint);
    missing.visible = t > pairEnd;
    missingLabel.visible = t >= pairEnd + 0.8;
    setOpacity(missing.material, fadeIn(t, pairEnd, pairEnd + 0.24));
    setOpacity(missingLabel.material, fadeIn(t, pairEnd + 0.8, pairEnd + 1.2));
    group.getWorldQuaternion(inverse).invert();
    camera.getWorldQuaternion(facing);
    facing.premultiply(inverse);
    billboardRight.set(1, 0, 0).applyQuaternion(facing);
    billboardUp.set(0, 1, 0).applyQuaternion(facing);
    const labelPixels = THREE.MathUtils.clamp(viewportHeight * 0.065, 20, 28);
    labels.forEach(({ mesh, anchor, offset }) => {
      const units = unitsPerPixel(anchor);
      mesh.quaternion.copy(facing);
      mesh.scale.setScalar((labelPixels * units) / 0.32);
      mesh.position
        .copy(anchor)
        .addScaledVector(billboardRight, offset.x * units)
        .addScaledVector(billboardUp, offset.y * units);
    });
    markers.forEach(({ mesh, radius, pixels }) => {
      mesh.scale.setScalar((pixels * unitsPerPixel(mesh.position)) / radius);
    });
    dashedLines.forEach(({ line, midpoint }) => {
      line.material.dashScale = 1 / Math.max(unitsPerPixel(midpoint), 1e-8);
    });
    group.userData.stage = stage;
    group.userData.time = t;
    group.userData.clearing = clearing;
    group.userData.opacity = opacity;
    group.userData.daughterProgress = missingProgress;
    return stage;
  }
  return { group, update, vertices: parents.map(({ vertex }) => vertex) };
}
