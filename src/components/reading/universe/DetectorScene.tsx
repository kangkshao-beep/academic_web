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
  onEventStage: (stage: number) => void;
}

export default function DetectorScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.dataset.testid = 'detector-canvas';
    canvas.setAttribute('role', 'img');
    canvas.tabIndex = 0;
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    container.appendChild(canvas);

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
    const controls = new OrbitControls(camera, canvas);
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
    let dirty = true;

    function fitView(preserveZoom: boolean) {
      camera.updateMatrixWorld(true);
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      const aspect = viewportWidth / viewportHeight;
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
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      if (!preserveZoom) camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
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
    const resize = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width < 1 || height < 1) return;
      viewportWidth = width;
      viewportHeight = height;
      renderer.setSize(width, height);
      fitView(true);
    });
    resize.observe(container);

    let dragging = false;
    function start() {
      dragging = true;
      canvas.style.cursor = 'grabbing';
      dirty = true;
    }
    function end() {
      dragging = false;
      canvas.style.cursor = 'grab';
      dirty = true;
    }
    function stopPropagation(event: Event) {
      event.stopPropagation();
    }
    function focus(event: PointerEvent) {
      event.stopPropagation();
      if (!live.current.modalOpen) canvas.focus({ preventScroll: true });
    }
    function keyboard(event: KeyboardEvent) {
      if (!controls.enabled) return;
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Home') {
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
    canvas.addEventListener('pointerdown', focus);
    // OrbitControls listens for move/up on ownerDocument after capture begins.
    // Keep those events bubbling; the other canvas never receives pointerdown.
    canvas.addEventListener('wheel', stopPropagation);
    canvas.addEventListener('keydown', keyboard);

    let raf = 0;
    let lost = false;
    let last = performance.now();
    let report = last;
    let frames = 0;
    let eventClock = 0;
    let stage = -1;
    let reset = live.current.settings.reset;
    let quality = '';
    let signature = '';
    const projected = new THREE.Vector3();
    function tick(now: number) {
      if (document.hidden || lost) return;
      raf = requestAnimationFrame(tick);
      const delta = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      const { settings, modalOpen, locale } = live.current;
      const visible = settings.detector || settings.inspectDetector;
      controls.enabled = visible && !modalOpen;
      const nextSignature = JSON.stringify(settings) + modalOpen + locale;
      if (signature !== nextSignature) {
        signature = nextSignature;
        dirty = true;
        canvas.setAttribute(
          'aria-label',
          say(
            locale,
            'Interactive detector: drag to rotate, scroll or pinch to zoom without an upper limit, right-drag or two-finger drag to pan. Arrow keys rotate, Shift + arrows pan, plus and minus zoom, Home resets the view.',
            '独立探测器：拖动旋转，滚轮或双指缩放，无放大上限；右键拖动或双指拖动平移。方向键旋转，Shift 加方向键平移，加减号缩放，Home 重置视角。',
            '獨立探測器：拖動旋轉，滾輪或雙指縮放，無放大上限；右鍵拖動或雙指拖動平移。方向鍵旋轉，Shift 加方向鍵平移，加減號縮放，Home 重設視角。'
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
      camera.updateMatrixWorld(true);
      scene.updateMatrixWorld(true);
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
        const points = boxCorners(structureBounds()).map((point) => point.project(camera));
        const xs = points.map((point) => ((point.x + 1) * viewportWidth) / 2);
        const ys = points.map((point) => ((1 - point.y) * viewportHeight) / 2);
        canvas.dataset.detectorBounds = JSON.stringify({
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        });
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
      cancelAnimationFrame(raf);
      setFailed(true);
    }
    canvas.addEventListener('webglcontextlost', contextLost);
    document.addEventListener('visibilitychange', visibility);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('pointerdown', focus);
      canvas.removeEventListener('wheel', stopPropagation);
      canvas.removeEventListener('keydown', keyboard);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      canvas.remove();
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
