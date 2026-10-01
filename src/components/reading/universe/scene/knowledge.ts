import * as THREE from 'three';
import panels from '@/lib/reading/universe/knowledge.json';
import { frame, textMesh } from './primitives';

export function createKnowledgeWall(onTextureReady: () => void) {
  const group = new THREE.Group();
  const targets: THREE.Mesh[] = [];
  let disposed = false;
  let lastLayout = '';
  const forward = new THREE.Vector3();
  const boards = panels.map((panel, i) => {
    const board = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: '#102c34',
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      })
    );
    glass.userData.boardId = panel.id;
    targets.push(glass);
    const border = frame(1, 1, '#68ced2', 0.23);
    border.material.fog = false;
    const rail = frame(1, 1, '#65c6d7', 0.06);
    rail.material.fog = false;
    rail.position.z = -0.12;
    const heading = textMesh(
      `${String(i + 1).padStart(2, '0')} / ${panel.title}`,
      '#6fa1a9',
      0.3,
      6
    );
    const texture = new THREE.TextureLoader().load(
      `/research-universe/formulas/${panel.id}.svg`,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        // SVGs have different natural aspect ratios. Never stretch their glyphs
        // to a shared rectangle, even though the surrounding boards are equal.
        const img = tex.image as HTMLImageElement;
        formula.geometry.dispose();
        formula.geometry = new THREE.PlaneGeometry(img.naturalWidth / img.naturalHeight, 1);
        lastLayout = '';
        onTextureReady();
      }
    );
    const formula = new THREE.Mesh(
      new THREE.PlaneGeometry(5.95, 0.68),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      })
    );
    const steps = panel.steps
      .slice(0, 4)
      .map((step, index) =>
        textMesh(`${String(index + 1).padStart(2, '0')}  ${step.title}`, '#638d92', 0.25, 5.8)
      );
    const source = textMesh(
      `MANNEL / § ${panel.section} · pp. ${panel.pages}`,
      '#56838e',
      0.21,
      5.6
    );
    for (const text of [heading, source, ...steps]) {
      text.material.fog = false;
      text.material.opacity = 0.65;
      text.position.z = 0.04;
    }
    formula.position.z = 0.03;
    board.add(glass, border, rail, heading, formula, source, ...steps);
    group.add(board);
    return { board, glass, border, rail, heading, formula, source, steps };
  });

  function fit(mesh: THREE.Mesh<THREE.PlaneGeometry>, width: number, height: number) {
    // Preserve glyph/formula aspect ratios inside a consistently proportioned board.
    mesh.scale.setScalar(
      Math.min(width / mesh.geometry.parameters.width, height / mesh.geometry.parameters.height)
    );
  }
  return {
    group,
    targets,
    layout(camera: THREE.PerspectiveCamera, viewportWidth: number, viewportHeight: number) {
      // Keep the composition stable during orbit/zoom. Dimensions come from
      // the board aspect ratio, not from stretching to fill the viewport.
      const distance = 60;
      group.position
        .copy(camera.position)
        .addScaledVector(camera.getWorldDirection(forward), distance);
      group.quaternion.copy(camera.quaternion);
      const signature = `${viewportWidth}:${viewportHeight}:${camera.fov}`;
      if (signature === lastLayout) return;
      lastLayout = signature;
      const unit =
        (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / viewportHeight;
      const compact = viewportWidth < 600;
      const minimumMargin = compact ? 18 : Math.max(28, viewportWidth * 0.035);
      const gap = compact ? 10 : 14;
      const columns = compact ? 2 : 6;
      const rows = compact ? 4 : 2;
      const aspect = compact ? 1.85 : 1.25;
      // Closing the topic index gives all eight boards more room. Grow them
      // together, with an upper size limit and a fixed aspect ratio even on
      // very wide or shallow windows; never stretch one axis to fill space.
      const boardWidth = Math.min(
        (viewportWidth - 2 * minimumMargin - (columns - 1) * gap) / columns,
        ((viewportHeight - 150 - (rows - 1) * gap) / rows) * aspect,
        compact ? 180 : 280
      );
      const boardHeight = boardWidth / aspect;
      const wallWidth = columns * boardWidth + (columns - 1) * gap;
      const margin = (viewportWidth - wallWidth) / 2;
      const wallHeight = rows * boardHeight + (rows - 1) * gap;
      const top = compact ? 86 : Math.max(82, (viewportHeight - wallHeight) * 0.4);
      boards.forEach(({ board, glass, border, rail, heading, formula, source, steps }, i) => {
        const row = Math.floor(i / (compact ? 2 : 4));
        const slot = compact ? i % 2 : (i % 4) + row * 2;
        const width = boardWidth * unit;
        const height = boardHeight * unit;
        const centerX = margin + boardWidth / 2 + slot * (boardWidth + gap);
        const centerY = top + boardHeight / 2 + row * (boardHeight + gap);
        board.position.set(
          (centerX - viewportWidth / 2) * unit,
          (viewportHeight / 2 - centerY) * unit,
          0
        );
        glass.scale.set(width, height, 1);
        border.scale.set(width, height, 1);
        rail.scale.set(width + 2 * unit, height + 2 * unit, 1);
        const contentWidth = width * 0.86;
        fit(heading, contentWidth, height * 0.12);
        heading.position.y = height * 0.36;
        fit(formula, contentWidth, height * 0.19);
        formula.position.y = height * 0.13;
        steps.forEach((step, j) => {
          fit(step, contentWidth, height * 0.075);
          step.position.y = height * (-0.08 - j * 0.082);
          step.visible = !compact;
        });
        fit(source, contentWidth, height * 0.065);
        source.position.y = -height * 0.42;
      });
    },
    dispose: () => {
      disposed = true;
    },
  };
}
