import * as THREE from 'three';

/** Closed annular wedge, with the beam axis along z. Dimensions are in metres. */
export function radialPrism(inner: number, outer: number, angle: number, depth: number) {
  const xy = [
    [inner * Math.cos(-angle / 2), inner * Math.sin(-angle / 2)],
    [outer * Math.cos(-angle / 2), outer * Math.sin(-angle / 2)],
    [outer * Math.cos(angle / 2), outer * Math.sin(angle / 2)],
    [inner * Math.cos(angle / 2), inner * Math.sin(angle / 2)],
  ];
  const vertices = [-depth / 2, depth / 2].flatMap((z) => xy.flatMap(([x, y]) => [x, y, z]));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0,
    4, 3, 4, 7,
  ]);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}

export function placement(x: number, y: number, z: number, angle = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle),
    new THREE.Vector3(1, 1, 1)
  );
}

/** Repeated detector units share one draw call; their outlines are also batched. */
export function detectorUnits(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  matrices: THREE.Matrix4[],
  color: string,
  opacity: number,
  edgeOpacity = 0.25
) {
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.38,
    roughness: 0.48,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 0.8,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    fog: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  const shade = new THREE.Color();
  matrices.forEach((matrix, i) => {
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, shade.setScalar(0.91 + (i % 3) * 0.035));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  if (edgeOpacity > 0) {
    const edges = new THREE.EdgesGeometry(geometry, 24);
    const positions = edges.getAttribute('position');
    const points = new Float32Array(matrices.length * positions.count * 3);
    const point = new THREE.Vector3();
    let offset = 0;
    for (const matrix of matrices) {
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
        points[offset++] = point.x;
        points[offset++] = point.y;
        points[offset++] = point.z;
      }
    }
    edges.dispose();
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.BufferAttribute(points, 3));
    parent.add(
      new THREE.LineSegments(
        lines,
        new THREE.LineBasicMaterial({
          color: '#c5d3df',
          transparent: true,
          opacity: edgeOpacity,
          depthWrite: false,
          fog: false,
        })
      )
    );
  }
  return mesh;
}
