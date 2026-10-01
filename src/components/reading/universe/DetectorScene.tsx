'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EVENT_STAGE_TIMES, collisionPhase } from '@/lib/reading/universe/collision';
import { say, type Locale } from '@/lib/reading/universe/model';
import type { SceneSettings } from './ResearchScene';
import { createDetector } from './scene/detector';
import { disposeObject } from './scene/primitives';

interface Props {
  settings: SceneSettings;
  locale: Locale;
  modalOpen: boolean;
  resetRevision: number;
  onEventStage: (stage: number) => void;
}

export default function DetectorScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Render outside the clipped research workspace. The dock is only a layout
    // anchor; the instrument can grow across the page without resizing its camera.
    const overlay = document.createElement('div');
    overlay.className = 'ru-detector-overlay';
    const canvas = renderer.domElement;
    canvas.dataset.testid = 'detector-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const interaction = document.createElement('div');
    interaction.className = 'ru-detector-interaction';
    interaction.dataset.testid = 'detector-interaction';
    interaction.setAttribute('role', 'img');
    interaction.tabIndex = 0;
    overlay.append(canvas, interaction);
    document.body.appendChild(overlay);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#cbd7e3', '#141c29', 1.8));
    const key = new THREE.DirectionalLight('#e7edf5', 2.6);
    key.position.set(-4, 8, 12);
    const rim = new THREE.DirectionalLight('#b3c4d7', 1.7);
    rim.position.set(5, 1, -6);
    scene.add(key, rim);
    const detector = createDetector();
    scene.add(detector.root);
    const initialRotation = detector.body.rotation.clone();
    // Optical zoom keeps the event in front of the camera even at large scales.
    // Dolly-only perspective zoom would pass through the secondary vertices.
    const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.05, 150);
    camera.position.set(0, 0, 18);
    const controls = new OrbitControls(camera, interaction);
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.minZoom = 0.25;
    controls.maxZoom = Infinity;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.75;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI - 0.12;
    controls.update();

    // Centre the actual instrument, not the long incoming beams or event labels.
    // Rotating this local centre with the body keeps the cutaway balanced in its
    // own viewport while preserving a single pivot for mouse and touch orbiting.
    const structuralBox = new THREE.Box3();
    const layerBox = new THREE.Box3();
    function structureBounds() {
      scene.updateMatrixWorld(true);
      structuralBox.makeEmpty();
      detector.layers.forEach((layer) => structuralBox.union(layerBox.setFromObject(layer)));
      return structuralBox;
    }
    detector.body.rotation.set(0, 0, 0);
    const localCentre = structureBounds().getCenter(new THREE.Vector3());
    detector.body.rotation.copy(initialRotation);
    function centreInstrument() {
      detector.root.position.copy(localCentre).applyEuler(detector.body.rotation).negate();
    }
    centreInstrument();

    const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
    function boxCorners(box: THREE.Box3) {
      corners.forEach((point, i) =>
        point.set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z
        )
      );
      return corners;
    }
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const offset = new THREE.Vector3();
    let viewportWidth = 1;
    let viewportHeight = 1;
    let dockRect = container.getBoundingClientRect();
    let sceneTop = 0;
    let worldUnitsPerPixel = 1;
    let layoutDirty = true;
    let projectionZoom = -1;
    let inspecting = live.current.settings.inspectDetector;
    let anchorX = 0;
    let anchorY = 0;
    let dirty = true;

    function fitView(preserveZoom: boolean) {
      camera.updateMatrixWorld(true);
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      const aspect = dockRect.width / dockRect.height;
      let halfHeight = 0;
      for (const point of boxCorners(structureBounds())) {
        // Fit about the fixed instrument centre. Using the panned target here
        // would change the magnification unexpectedly when the viewport resizes.
        halfHeight = Math.max(
          halfHeight,
          Math.abs(point.dot(right)) / aspect,
          Math.abs(point.dot(up))
        );
      }
      // Leave a small margin around the instrument so the two beam entrances read.
      halfHeight *= 1.12;
      worldUnitsPerPixel = (halfHeight * 2) / dockRect.height;
      if (!preserveZoom) camera.zoom = 1;
      updateProjection();
      controls.update();
      dirty = true;
    }
    function updateProjection() {
      const halfWidth = (viewportWidth * worldUnitsPerPixel) / 2;
      const halfHeight = (viewportHeight * worldUnitsPerPixel) / 2;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      const dockX = dockRect.x + dockRect.width / 2;
      const dockY = dockRect.y + dockRect.height / 2;
      // Give an enlarging instrument room on all sides. Above 3x the anchor
      // stops moving, so cursor zoom can inspect a chosen decay vertex freely.
      const expansion = inspecting ? 0 : THREE.MathUtils.smoothstep(camera.zoom, 1, 3);
      anchorX = THREE.MathUtils.lerp(dockX, viewportWidth / 2, expansion);
      const expandedY = (Math.max(0, sceneTop) + viewportHeight) / 2;
      anchorY = THREE.MathUtils.lerp(dockY, expandedY, expansion);
      camera.setViewOffset(
        viewportWidth,
        viewportHeight,
        viewportWidth / 2 - anchorX,
        viewportHeight / 2 - anchorY,
        viewportWidth,
        viewportHeight
      );
      controls.rotateSpeed =
        (0.7 * viewportHeight) /
        Math.min(viewportHeight, dockRect.height * Math.max(1, Math.min(camera.zoom, 3)));
      projectionZoom = camera.zoom;
      dirty = true;
    }
    function resetView() {
      controls.enableDamping = false;
      controls.update();
      controls.target.set(0, 0, 0);
      camera.position.set(0, 0, 18);
      camera.lookAt(controls.target);
      fitView(false);
      controls.enableDamping = true;
    }
    function invalidateLayout() {
      layoutDirty = true;
    }
    function updateLayout() {
      const nextDock = container.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      const sizeChanged = nextDock.width !== dockRect.width || nextDock.height !== dockRect.height;
      dockRect = nextDock;
      sceneTop = container.closest('.ru-viewport')?.getBoundingClientRect().top ?? 0;
      if (viewportWidth !== width || viewportHeight !== height) {
        viewportWidth = width;
        viewportHeight = height;
        renderer.setSize(width, height);
      }
      if (dockRect.width > 0 && dockRect.height > 0) {
        if (sizeChanged || worldUnitsPerPixel === 1) fitView(true);
        else updateProjection();
      }
      layoutDirty = false;
    }
    const resize = new ResizeObserver(invalidateLayout);
    resize.observe(container);
    resize.observe(document.documentElement);
    window.addEventListener('resize', invalidateLayout);
    window.addEventListener('scroll', invalidateLayout, true);

    let dragging = false;
    function start() {
      dragging = true;
      interaction.style.cursor = 'grabbing';
      dirty = true;
    }
    function end() {
      dragging = false;
      interaction.style.cursor = 'grab';
      dirty = true;
    }
    function stopPropagation(event: Event) {
      event.stopPropagation();
    }
    function focus(event: PointerEvent) {
      event.stopPropagation();
      if (!live.current.modalOpen) interaction.focus({ preventScroll: true });
    }
    function keyboard(event: KeyboardEvent) {
      if (!controls.enabled) return;
      const keys = [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        '+',
        '=',
        '-',
        '_',
        'Home',
        'Escape',
      ];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Home' || event.key === 'Escape') {
        resetView();
        return;
      }
      controls.enableDamping = false;
      controls.update();
      if (event.shiftKey && event.key.startsWith('Arrow')) {
        camera.updateMatrixWorld(true);
        const horizontal = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        const vertical = event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0;
        offset
          .setFromMatrixColumn(camera.matrixWorld, 0)
          .multiplyScalar((horizontal * (camera.right - camera.left) * 0.08) / camera.zoom)
          .addScaledVector(
            up.setFromMatrixColumn(camera.matrixWorld, 1),
            (vertical * (camera.top - camera.bottom) * 0.08) / camera.zoom
          );
        camera.position.add(offset);
        controls.target.add(offset);
      }
      const spherical = new THREE.Spherical().setFromVector3(
        offset.copy(camera.position).sub(controls.target)
      );
      if (!event.shiftKey) {
        if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
        if (event.key === 'ArrowRight') spherical.theta += 0.12;
        if (event.key === 'ArrowUp') spherical.phi -= 0.12;
        if (event.key === 'ArrowDown') spherical.phi += 0.12;
      }
      if (event.key === '+' || event.key === '=') camera.zoom /= 0.9;
      if (event.key === '-' || event.key === '_')
        camera.zoom = Math.max(controls.minZoom, camera.zoom * 0.9);
      camera.updateProjectionMatrix();
      spherical.phi = THREE.MathUtils.clamp(
        spherical.phi,
        controls.minPolarAngle,
        controls.maxPolarAngle
      );
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      controls.update();
      controls.enableDamping = true;
      dirty = true;
    }
    controls.addEventListener('start', start);
    controls.addEventListener('end', end);
    interaction.addEventListener('pointerdown', focus);
    // OrbitControls listens for move/up on ownerDocument after capture begins.
    // Keep those events bubbling; the other canvas never receives pointerdown.
    interaction.addEventListener('wheel', stopPropagation);
    interaction.addEventListener('keydown', keyboard);

    let raf = 0;
    let lost = false;
    let last = performance.now();
    let report = last;
    let frames = 0;
    let eventClock = 0;
    let stage = -1;
    let reset = live.current.settings.reset;
    let resetRevision = live.current.resetRevision;
    let quality = '';
    let signature = '';
    const projected = new THREE.Vector3();
    const hitBounds = { x: 0, y: 0, width: 0, height: 0 };
    const detectorBounds = { x: 0, y: 0, width: 0, height: 0 };
    function updateHitRegion(enabled: boolean) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of boxCorners(structureBounds())) {
        point.project(camera);
        const x = ((point.x + 1) * viewportWidth) / 2;
        const y = ((1 - point.y) * viewportHeight) / 2;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      Object.assign(detectorBounds, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
      const docked = camera.zoom <= 1.05 && controls.target.lengthSq() < 1e-8;
      hitBounds.x = Math.max(0, docked ? dockRect.left : minX - 20);
      hitBounds.y = Math.max(0, docked ? dockRect.top : minY - 20);
      const rightEdge = Math.min(viewportWidth, docked ? dockRect.right : maxX + 20);
      const bottomEdge = Math.min(viewportHeight, docked ? dockRect.bottom : maxY + 20);
      hitBounds.width = Math.max(0, rightEdge - hitBounds.x);
      hitBounds.height = Math.max(0, bottomEdge - hitBounds.y);
      // Clip only the input surface, never the WebGL canvas. Outside this area
      // clicks and wheel gestures reach the blackboards and main scene normally.
      interaction.style.clipPath = `inset(${hitBounds.y}px ${Math.max(0, viewportWidth - rightEdge)}px ${Math.max(0, viewportHeight - bottomEdge)}px ${hitBounds.x}px)`;
      interaction.style.pointerEvents = enabled ? 'auto' : 'none';
      interaction.tabIndex = enabled ? 0 : -1;
      for (const [key, value] of Object.entries(hitBounds)) {
        interaction.style.setProperty(`--detector-hit-${key}`, `${value}px`);
      }
      canvas.dataset.hitBounds = JSON.stringify(hitBounds);
      canvas.dataset.detectorBounds = JSON.stringify(detectorBounds);
    }
    function tick(now: number) {
      if (document.hidden || lost) return;
      raf = requestAnimationFrame(tick);
      const delta = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      const { settings, modalOpen, locale } = live.current;
      if (inspecting !== settings.inspectDetector) {
        inspecting = settings.inspectDetector;
        layoutDirty = true;
      }
      if (layoutDirty) updateLayout();
      const visible =
        (settings.detector || settings.inspectDetector) &&
        dockRect.width > 0 &&
        dockRect.height > 0 &&
        dockRect.bottom > 0 &&
        dockRect.top < viewportHeight;
      overlay.hidden = !visible;
      controls.enabled = visible && !modalOpen;
      const nextSignature = JSON.stringify(settings) + modalOpen + locale;
      if (signature !== nextSignature) {
        signature = nextSignature;
        dirty = true;
        interaction.setAttribute(
          'aria-label',
          say(
            locale,
            'Interactive detector: drag to rotate, scroll or pinch to enlarge beyond the dock without an upper limit, right-drag or two-finger drag to pan. Arrow keys rotate, Shift + arrows pan, plus and minus zoom, Home or Escape restores the view.',
            '独立探测器：拖动旋转，滚轮或双指放大，可越出原区域且无上限；右键拖动或双指拖动平移。方向键旋转，Shift 加方向键平移，加减号缩放，Home 或 Esc 恢复视角。',
            '獨立探測器：拖動旋轉，滾輪或雙指放大，可越出原區域且無上限；右鍵拖動或雙指拖動平移。方向鍵旋轉，Shift 加方向鍵平移，加減號縮放，Home 或 Esc 恢復視角。'
          )
        );
      }
      if (settings.reset !== reset) {
        detector.body.rotation.copy(initialRotation);
        centreInstrument();
        eventClock = 0;
        resetView();
        reset = settings.reset;
      }
      if (resetRevision !== live.current.resetRevision) {
        resetView();
        resetRevision = live.current.resetRevision;
      }
      if (quality !== settings.quality) {
        quality = settings.quality;
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio, quality === 'low' ? 1 : quality === 'high' ? 2 : 1.5)
        );
        dirty = true;
      }
      if (!visible) return;
      detector.layers.forEach((layer, i) => {
        layer.visible = !settings.hiddenLayers.includes(i);
      });
      const moving = settings.playing && !settings.reduced && !modalOpen && !dragging;
      if (moving) {
        if (settings.eventTime === null) eventClock += delta * settings.collisionSpeed;
        if (settings.rotateDetector)
          detector.body.rotation.y += delta * 0.03 * settings.detectorSpeed * settings.direction;
        centreInstrument();
      }
      const changed = controls.update();
      if (camera.zoom !== projectionZoom) updateProjection();
      camera.updateMatrixWorld(true);
      scene.updateMatrixWorld(true);
      updateHitRegion(controls.enabled);
      const displayedTime =
        settings.eventTime ?? (settings.reduced ? EVENT_STAGE_TIMES[4] : eventClock);
      const nextStage = detector.update(displayedTime, settings.tracks, camera, viewportHeight);
      if (nextStage !== stage) {
        stage = nextStage;
        live.current.onEventStage(stage);
      }
      if (moving || changed || dirty) {
        renderer.render(scene, camera);
        frames++;
        dirty = false;
      }
      if (now - report >= 500) {
        canvas.dataset.camera = camera.position
          .toArray()
          .map((value) => value.toFixed(3))
          .join(',');
        canvas.dataset.zoom = String(camera.zoom);
        canvas.dataset.detectorAngle = detector.body.rotation.y.toFixed(4);
        canvas.dataset.eventTime = displayedTime.toFixed(3);
        canvas.dataset.eventStage = String(stage);
        canvas.dataset.eventClearing = String(collisionPhase(displayedTime).clearing);
        canvas.dataset.eventOpacity = String(detector.eventState.opacity ?? 1);
        canvas.dataset.daughterProgress = String(detector.eventState.daughterProgress ?? 0);
        canvas.dataset.collisionSpeed = String(settings.collisionSpeed);
        canvas.dataset.detectorSpeed = String(settings.detectorSpeed);
        canvas.dataset.drawCalls = String(renderer.info.render.calls);
        canvas.dataset.fps = (frames / ((now - report) / 1000)).toFixed(1);
        canvas.dataset.view = settings.inspectDetector ? 'detector' : 'dock';
        canvas.dataset.hiddenLayers = settings.hiddenLayers.join(',');
        projected.copy(controls.target).project(camera);
        canvas.dataset.targetX = String(((projected.x + 1) * viewportWidth) / 2);
        canvas.dataset.targetY = String(((1 - projected.y) * viewportHeight) / 2);
        canvas.dataset.decayVertices = JSON.stringify(
          detector.vertices.map((vertex) => {
            vertex.getWorldPosition(projected).project(camera);
            return {
              x: ((projected.x + 1) * viewportWidth) / 2,
              y: ((1 - projected.y) * viewportHeight) / 2,
            };
          })
        );
        frames = 0;
        report = now;
      }
    }
    function visibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden && !lost) {
        last = performance.now();
        dirty = true;
        raf = requestAnimationFrame(tick);
      }
    }
    function contextLost(event: Event) {
      event.preventDefault();
      lost = true;
      overlay.hidden = true;
      controls.enabled = false;
      interaction.style.pointerEvents = 'none';
      interaction.tabIndex = -1;
      cancelAnimationFrame(raf);
      setFailed(true);
    }
    canvas.addEventListener('webglcontextlost', contextLost);
    document.addEventListener('visibilitychange', visibility);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      window.removeEventListener('resize', invalidateLayout);
      window.removeEventListener('scroll', invalidateLayout, true);
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('webglcontextlost', contextLost);
      interaction.removeEventListener('pointerdown', focus);
      interaction.removeEventListener('wheel', stopPropagation);
      interaction.removeEventListener('keydown', keyboard);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      overlay.remove();
    };
  }, []);

  return (
    <div ref={host} className="ru-detector-scene">
      {failed && (
        <div className="ru-fallback" role="status">
          {say(
            props.locale,
            'Detector 3D view is unavailable. Event notes remain available below.',
            '探测器 3D 视图暂不可用，仍可展开下方事例说明。',
            '探測器 3D 視圖暫不可用，仍可展開下方事例說明。'
          )}
        </div>
      )}
    </div>
  );
}
