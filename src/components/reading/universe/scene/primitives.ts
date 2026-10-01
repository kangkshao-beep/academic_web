import * as THREE from 'three';

export function textMesh(
  text: string,
  color = '#a9eff2',
  height = 0.5,
  maxWidth = 6,
  weight = 500
) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${weight} 76px Arial, "PingFang SC", "Microsoft YaHei", sans-serif`;
  canvas.width = Math.min(4096, Math.ceil(ctx.measureText(text).width + 52));
  canvas.height = 132;
  ctx.font = `${weight} 76px Arial, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 1.5;
  ctx.fillText(text, canvas.width / 2, 66, canvas.width - 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const width = Math.min(maxWidth, (height * canvas.width) / canvas.height);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  );
  return mesh;
}

// Extrude the actual glyph silhouette, including Chinese characters and counters.
// The canvas supplies antialiased caps; only exposed glyph edges form side walls.
// Merging adjacent edge pixels keeps geometry small and avoids a rectangular plaque.
export function extrudedText(text: string, color: string, height: number, maxWidth: number) {
  const front = textMesh(text, color, height, maxWidth, 600);
  const canvas = front.material.map!.image as HTMLCanvasElement;
  const { width: pixelsWide, height: pixelsHigh } = canvas;
  const data = canvas.getContext('2d')!.getImageData(0, 0, pixelsWide, pixelsHigh).data;
  const width = front.geometry.parameters.width;
  const depth = 0.16;
  const positions: number[] = [];
  const solid = (x: number, y: number) =>
    x >= 0 &&
    x < pixelsWide &&
    y >= 0 &&
    y < pixelsHigh &&
    data[(y * pixelsWide + x) * 4 + 3] >= 128;
  function wall(ax: number, ay: number, bx: number, by: number) {
    const x1 = (ax / pixelsWide - 0.5) * width;
    const y1 = (0.5 - ay / pixelsHigh) * height;
    const x2 = (bx / pixelsWide - 0.5) * width;
    const y2 = (0.5 - by / pixelsHigh) * height;
    positions.push(x1, y1, 0, x2, y2, 0, x2, y2, -depth, x1, y1, 0, x2, y2, -depth, x1, y1, -depth);
  }
  // Walk the four directions; merge collinear boundary runs before making quads.
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const horizontal = side === 'top' || side === 'bottom';
    const rows = horizontal ? pixelsHigh : pixelsWide;
    const columns = horizontal ? pixelsWide : pixelsHigh;
    for (let row = 0; row < rows; row++) {
      let start = -1;
      for (let column = 0; column <= columns; column++) {
        const x = horizontal ? column : row;
        const y = horizontal ? row : column;
        const dx = side === 'left' ? -1 : side === 'right' ? 1 : 0;
        const dy = side === 'top' ? -1 : side === 'bottom' ? 1 : 0;
        const exposed = column < columns && solid(x, y) && !solid(x + dx, y + dy);
        if (exposed && start === -1) start = column;
        if (!exposed && start !== -1) {
          if (side === 'top') wall(start, row, column, row);
          else if (side === 'bottom') wall(column, row + 1, start, row + 1);
          else if (side === 'right') wall(row + 1, start, row + 1, column);
          else wall(row, column, row, start);
          start = -1;
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const sides = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      color: new THREE.Color(color).multiplyScalar(0.18),
      side: THREE.DoubleSide,
    })
  );
  const backMaterial = front.material.clone();
  backMaterial.color.set('#345261');
  const back = new THREE.Mesh(front.geometry, backMaterial);
  back.position.z = -depth;
  front.add(sides, back);
  front.rotation.set(0.08, -0.28, 0);
  front.userData.extrusionDepth = depth;
  front.userData.sideVertices = positions.length / 3;
  return front;
}
export function polyline(points: THREE.Vector3[], color: string, opacity = 0.3, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed
    ? new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity,
        dashSize: 0.13,
        gapSize: 0.1,
        depthWrite: false,
      })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}
export function frame(width: number, height: number, color = '#55e6dd', opacity = 0.25) {
  return polyline(
    [
      [-width / 2, -height / 2, 0],
      [width / 2, -height / 2, 0],
      [width / 2, height / 2, 0],
      [-width / 2, height / 2, 0],
      [-width / 2, -height / 2, 0],
    ].map((p) => new THREE.Vector3(...p)),
    color,
    opacity
  );
}
export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const obj = o as THREE.Mesh;
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material)
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        materials.add(m);
        const map = (m as THREE.MeshBasicMaterial).map;
        if (map) textures.add(map);
      }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
