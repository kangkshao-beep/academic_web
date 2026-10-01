'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  localized,
  say,
  statusLabel,
  STATUS_SYMBOL,
  topicPosition,
  type ResearchTopic,
  type Locale,
} from '@/lib/reading/universe/model';
import { createKnowledgeWall } from './scene/knowledge';
import { disposeObject, extrudedText, frame, polyline, textMesh } from './scene/primitives';

export interface SceneSettings {
  playing: boolean;
  speed: number;
  direction: number;
  mode: 'read' | 'exhibit';
  quality: 'low' | 'medium' | 'high';
  reduced: boolean;
  background: boolean;
  detector: boolean;
  tracks: boolean;
  rotateDetector: boolean;
  collisionSpeed: number;
  detectorSpeed: number;
  hiddenLayers: number[];
  inspectDetector: boolean;
  eventTime: number | null;
  reset: number;
}
interface Props {
  topics: ResearchTopic[];
  locale: Locale;
  settings: SceneSettings;
  modalOpen: boolean;
  onSelect: (id: string) => void;
  onBoardSelect: (id: string) => void;
}
interface SceneNode {
  id: string;
  group: THREE.Group;
  outline: THREE.Line;
  position: THREE.Vector3;
  index: number;
  hit: THREE.Mesh;
  title: ReturnType<typeof extrudedText>;
}
export default function ResearchScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const [failed, setFailed] = useState(false);
  const controller = useRef<{
    setTopics: (topics: ResearchTopic[], locale: Locale) => void;
  } | null>(null);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setFailed(true);
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050d18');
    scene.fog = new THREE.FogExp2('#050d18', 0.013);
    scene.add(new THREE.HemisphereLight('#cbd7e3', '#141c29', 1.8));
    const instrumentLight = new THREE.DirectionalLight('#e7edf5', 2.6);
    instrumentLight.position.set(-4, 8, 12);
    scene.add(instrumentLight);
    const rimLight = new THREE.DirectionalLight('#b3c4d7', 1.7);
    rimLight.position.set(5, 1, -6);
    scene.add(rimLight);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 110);
    camera.position.set(0, 1.8, 25);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', 'Interactive 3D research space');
    canvas.setAttribute('role', 'img');
    canvas.dataset.testid = 'universe-canvas';
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0.4, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.enablePan = false;
    controls.minDistance = 15;
    controls.maxDistance = 38;
    controls.minPolarAngle = 0.6;
    controls.maxPolarAngle = 2.2;
    controls.update();
    controls.saveState();
    const cloud = new THREE.Group();
    cloud.position.set(1.5, 1, 0);
    scene.add(cloud);
    const layoutCache = new Map<string, THREE.Vector3>();
    let nodes: SceneNode[] = [];
    let targets: THREE.Object3D[] = [];
    let hovered: string | null = null;
    let dragging = false;
    let dirty = true;
    const redrawKnowledge = () => {
      dirty = true;
    };
    let knowledge = createKnowledgeWall(redrawKnowledge);
    scene.add(knowledge.group);
    let viewportWidth = container.clientWidth || 1;
    let viewportHeight = container.clientHeight || 1;
    const anchor = new THREE.Group();
    const main = textMesh('D → X e⁺ νₑ', '#ddfaf7', 1.65, 7.8, 500);
    anchor.add(main);
    const label = textMesh('INCLUSIVE CHARM · RESEARCH AXIS', '#609ca9', 0.23, 5);
    label.position.y = -0.9;
    anchor.add(label);
    anchor.position.set(0.6, 0.4, 1.1);
    scene.add(anchor);
    const floor = new THREE.GridHelper(60, 45, '#164956', '#0d2635');
    floor.position.y = -6.7;
    (floor.material as THREE.Material).transparent = true;
    (floor.material as THREE.Material).opacity = 0.2;
    scene.add(floor);
    const particlePoints = [];
    for (let i = 0; i < 330; i++) {
      const x = Math.sin(i * 127.1) * 19,
        y = Math.sin(i * 311.7) * 12,
        z = -6 + Math.sin(i * 74.7) * 15;
      particlePoints.push(x, y, z);
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.Float32BufferAttribute(particlePoints, 3));
    const particles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({
        color: '#5aa7b3',
        size: 0.025,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      })
    );
    scene.add(particles);
    function buildTopics(topics: ResearchTopic[], locale: Locale) {
      disposeObject(cloud);
      cloud.clear();
      nodes = [];
      targets = [];
      const limited = topics.slice(0, 60);
      const positions = new Map<string, THREE.Vector3>();
      const slots: THREE.Vector3[] = [];
      for (let row = 0; row < 6; row++)
        for (let col = 0; col < 5; col++) {
          const x = (col - 2) * 4.25,
            y = 5.1 - row * 1.95;
          if ((col === 0 && row >= 3) || (col === 2 && (row === 2 || row === 3))) continue;
          const z = Math.sin(row * 31 + col * 17) * 3.5;
          // Reserve a legible initial projection while retaining actual depth/parallax.
          slots.push(new THREE.Vector3((x * (25 - z)) / 25, (y * (25 - z)) / 25, z));
        }
      const occupied = new Set<number>();
      for (const t of limited) {
        const saved = layoutCache.get(t.id);
        if (saved) {
          const i = slots.findIndex((p) => p.distanceTo(saved) < 0.01);
          if (i >= 0) occupied.add(i);
        }
      }

      limited.forEach((topic, index) => {
        const t = localized(topic, locale);
        const group = new THREE.Group();
        let pos = layoutCache.get(topic.id);
        if (!pos) {
          const seed = topicPosition(topic.id);
          const start = Math.abs(Math.round(seed[0] * 997)) % slots.length;
          const free = Array.from(
            { length: slots.length },
            (_, n) => (start + n) % slots.length
          ).find((i) => !occupied.has(i));
          if (free !== undefined) {
            pos = slots[free].clone();
            occupied.add(free);
          } else {
            pos = new THREE.Vector3(...seed).multiplyScalar(1.3);
          }
          layoutCache.set(topic.id, pos);
        }
        positions.set(topic.id, pos);
        group.position.copy(pos);
        const color =
          topic.status === 'completed' ? '#8cefd0' : index % 4 === 1 ? '#d6a0dc' : '#86d9e5';
        const height = 0.82 + (index % 4) * 0.075;
        const title = extrudedText(t.shortTitle, color, height, 4.05);
        group.add(title);
        const width = (title.geometry as THREE.PlaneGeometry).parameters.width;
        const subtitle = textMesh(
          `${STATUS_SYMBOL[t.status]} ${statusLabel(t.status, locale)}`,
          topic.status === 'completed' ? '#75dab7' : '#7b9aa8',
          0.22,
          3
        );
        subtitle.position.y = -height * 0.55;
        group.add(subtitle);
        const outline = frame(width + 0.4, height + 0.5, color, 0);
        outline.position.z = -0.02;
        group.add(outline);
        const hit = new THREE.Mesh(
          new THREE.PlaneGeometry(width + 0.65, height + 0.6),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        hit.userData.topicId = topic.id;
        group.add(hit);
        targets.push(hit);
        if (topic.status === 'completed') {
          const badge = new THREE.Mesh(
            new THREE.RingGeometry(0.14, 0.18, 6),
            new THREE.MeshBasicMaterial({
              color: '#8cefd0',
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.85,
              depthWrite: false,
            })
          );
          badge.position.set(width / 2 + 0.34, 0.02, 0);
          badge.userData.topicId = topic.id;
          group.add(badge);
          targets.push(badge);
          const check = textMesh('✓', '#adffdf', 0.26, 0.3);
          check.position.copy(badge.position);
          check.position.z = 0.02;
          group.add(check);
        }
        cloud.add(group);
        nodes.push({ id: topic.id, group, outline, position: pos, index, hit, title });
      });
      for (const topic of limited)
        for (const related of topic.relatedTopicIds) {
          const a = positions.get(topic.id),
            b = positions.get(related);
          if (a && b) cloud.add(polyline([a, b], '#67aaba', 0.2, true));
        }
      knowledge.dispose();
      scene.remove(knowledge.group);
      disposeObject(knowledge.group);
      knowledge = createKnowledgeWall(redrawKnowledge);
      scene.add(knowledge.group);
      hovered = null;
      dirty = true;
    }
    controller.current = { setTopics: buildTopics };
    buildTopics(live.current.topics, live.current.locale);
    const pointer = new THREE.Vector2();
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    function pick(event: PointerEvent) {
      if (live.current.settings.inspectDetector) return null;
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1
      );
      ray.setFromCamera(pointer, camera);
      const topic = ray.intersectObjects(targets, false)[0]?.object.userData.topicId as
        string | undefined;
      if (topic) return topic;
      if (live.current.settings.background) {
        const board = ray.intersectObjects(knowledge.targets, false)[0]?.object.userData.boardId as
          string | undefined;
        if (board) return `board:${board}`;
      }
      return null;
    }
    function move(event: PointerEvent) {
      if (live.current.modalOpen || dragging) return;
      const id = pick(event) ?? null;
      if (id !== hovered) {
        hovered = id;
        canvas.style.cursor = id ? 'pointer' : 'grab';
        dirty = true;
      }
    }
    function press(event: PointerEvent) {
      down = { x: event.clientX, y: event.clientY };
    }
    function release(event: PointerEvent) {
      if (!down || live.current.modalOpen) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved < 6) {
        const id = pick(event);
        if (id?.startsWith('board:')) live.current.onBoardSelect(id.slice(6));
        else if (id) live.current.onSelect(id);
      }
    }
    function leave() {
      hovered = null;
      dirty = true;
    }
    const start = () => {
      dragging = true;
      hovered = null;
      dirty = true;
    };
    const end = () => {
      dragging = false;
      dirty = true;
    };
    controls.addEventListener('start', start);
    controls.addEventListener('end', end);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', press);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointerleave', leave);
    let lost = false;
    const contextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    const resize = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      viewportWidth = Math.max(1, rect.width);
      viewportHeight = Math.max(1, rect.height);
      camera.aspect = rect.width / Math.max(1, rect.height);
      // Keep the topic cloud in view on narrow screens; the list remains
      // the comfortable reading and keyboard navigation surface.
      camera.fov =
        rect.width < 600
          ? Math.max(72, THREE.MathUtils.radToDeg(2 * Math.atan(18.9 / (33.8 * camera.aspect))))
          : 43;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height);
      dirty = true;
    });
    resize.observe(container);
    let raf = 0,
      last = performance.now(),
      elapsed = 0,
      reset = live.current.settings.reset,
      quality = '',
      frames = 0,
      report = last;
    let oldSettings = '';
    let inspecting = false;
    const worldQuaternion = new THREE.Quaternion();
    const inverseCloud = new THREE.Quaternion();
    const temp = new THREE.Vector3();
    function tick(now: number) {
      if (document.hidden || lost) return;
      raf = requestAnimationFrame(tick);
      // The first RAF timestamp may precede effect setup within the same frame.
      const delta = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      const { settings, modalOpen } = live.current;
      const signature = JSON.stringify(settings) + modalOpen;
      if (signature !== oldSettings) {
        dirty = true;
        oldSettings = signature;
      }
      controls.enabled = !modalOpen && !settings.inspectDetector;
      if (settings.inspectDetector !== inspecting) {
        inspecting = settings.inspectDetector;
        hovered = null;
        dirty = true;
      }
      if (settings.reset !== reset) {
        controls.enableDamping = false;
        controls.update();
        controls.reset();
        controls.enableDamping = true;
        cloud.rotation.y = 0;
        reset = settings.reset;
        dirty = true;
      }
      if (settings.quality !== quality) {
        quality = settings.quality;
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio, quality === 'low' ? 1 : quality === 'high' ? 2 : 1.5)
        );
        dirty = true;
      }
      cloud.visible = !inspecting;
      anchor.visible = !inspecting;
      knowledge.group.visible = settings.background && !inspecting;
      floor.visible = settings.background;
      particles.visible = settings.background;
      const hoveringTopic = !!hovered && !hovered.startsWith('board:');
      const moving =
        settings.playing && !settings.reduced && !modalOpen && !hoveringTopic && !dragging;
      if (moving) {
        elapsed += delta;
        cloud.rotation.y += delta * 0.085 * settings.speed * settings.direction;
      }
      const changed = controls.update();
      if (!inspecting) knowledge.layout(camera, viewportWidth, viewportHeight);
      scene.updateMatrixWorld(true);
      cloud.getWorldQuaternion(inverseCloud).invert();
      camera.getWorldQuaternion(worldQuaternion);
      anchor.quaternion.copy(worldQuaternion);
      for (const node of nodes) {
        const active = hovered === node.id;
        node.group.quaternion.copy(inverseCloud).multiply(worldQuaternion);
        if (settings.mode === 'exhibit' && !active) {
          node.group.rotateY(Math.sin(elapsed * 0.3 + node.index) * 0.23);
          node.group.rotateZ(Math.sin(elapsed * 0.17 + node.index) * 0.045);
        }
        const scale = active ? 1.1 : 1;
        node.group.scale.lerp(new THREE.Vector3(scale, scale, scale), Math.min(1, delta * 14));
        (node.outline.material as THREE.LineBasicMaterial).opacity = active ? 0.8 : 0;
      }
      if (moving || dirty || changed || hovered) {
        renderer.render(scene, camera);
        frames++;
        dirty = false;
      }
      if (now - report > 500) {
        canvas.dataset.boards = String(knowledge.targets.length);
        canvas.dataset.boardBounds = JSON.stringify(
          knowledge.targets.map((board) => {
            const topLeft = board.localToWorld(new THREE.Vector3(-0.5, 0.5, 0)).project(camera);
            const bottomRight = board.localToWorld(new THREE.Vector3(0.5, -0.5, 0)).project(camera);
            return {
              x: ((topLeft.x + 1) * viewportWidth) / 2,
              y: ((1 - topLeft.y) * viewportHeight) / 2,
              width: ((bottomRight.x - topLeft.x) * viewportWidth) / 2,
              height: ((topLeft.y - bottomRight.y) * viewportHeight) / 2,
            };
          })
        );
        const firstBoard = knowledge.targets[0];
        firstBoard.getWorldPosition(temp).project(camera);
        canvas.dataset.boardX = String(((temp.x + 1) * canvas.clientWidth) / 2);
        canvas.dataset.boardY = String(((-temp.y + 1) * canvas.clientHeight) / 2);
        knowledge.targets[2].getWorldPosition(temp).project(camera);
        canvas.dataset.thirdBoardX = String(((temp.x + 1) * canvas.clientWidth) / 2);
        knowledge.targets[4].getWorldPosition(temp).project(camera);
        canvas.dataset.lowerBoardX = String(((temp.x + 1) * canvas.clientWidth) / 2);
        canvas.dataset.lowerBoardY = String(((-temp.y + 1) * canvas.clientHeight) / 2);
        canvas.dataset.angle = cloud.rotation.y.toFixed(4);
        canvas.dataset.camera = camera.position
          .toArray()
          .map((v) => v.toFixed(2))
          .join(',');
        canvas.dataset.nodes = String(nodes.length);
        canvas.dataset.textDepth = String(nodes[0]?.title.userData.extrusionDepth ?? 0);
        canvas.dataset.textSideVertices = String(nodes[0]?.title.userData.sideVertices ?? 0);
        canvas.dataset.view = inspecting ? 'detector' : 'universe';
        canvas.dataset.drawCalls = String(renderer.info.render.calls);
        canvas.dataset.fps = (frames / ((now - report) / 1000)).toFixed(1);
        canvas.dataset.hovered = hovered ?? '';
        const first = nodes.find((n) => {
          n.group.getWorldPosition(temp).project(camera);
          return Math.abs(temp.x) < 0.8 && Math.abs(temp.y) < 0.8 && temp.z < 1;
        });
        if (first) {
          first.group.getWorldPosition(temp).project(camera);
          canvas.dataset.firstId = first.id;
          canvas.dataset.firstX = String(((temp.x + 1) * canvas.clientWidth) / 2);
          canvas.dataset.firstY = String(((-temp.y + 1) * canvas.clientHeight) / 2);
        }
        frames = 0;
        report = now;
      }
    }
    const visibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        dirty = true;
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    raf = requestAnimationFrame(tick);
    return () => {
      controller.current = null;
      cancelAnimationFrame(raf);
      resize.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', press);
      canvas.removeEventListener('pointerup', release);
      canvas.removeEventListener('pointerleave', leave);
      controls.dispose();
      knowledge.dispose();
      disposeObject(scene);
      renderer.dispose();
      canvas.remove();
    };
  }, []);
  useEffect(() => {
    controller.current?.setTopics(props.topics, props.locale);
  }, [props.topics, props.locale]);
  return (
    <div ref={host} className="ru-scene" data-testid="research-scene">
      {failed && (
        <div className="ru-fallback" role="status">
          {say(
            props.locale,
            'WebGL is unavailable. Use the topic list to read and update your research.',
            'WebGL 不可用。你仍可通过课题列表阅读内容、更新进度。',
            'WebGL 不可用。仍可透過課題列表閱讀與更新進度。'
          )}
        </div>
      )}
    </div>
  );
}
