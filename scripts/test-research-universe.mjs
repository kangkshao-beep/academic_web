import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function compile(path, map = {}) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  for (const [name, url] of Object.entries(map))
    source = source.replaceAll(`'${name}'`, `'${url}'`);
  return (
    'data:text/javascript;base64,' +
    Buffer.from(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText
    ).toString('base64')
  );
}
const modelURL = await compile('../src/lib/reading/universe/model.ts');
const model = await import(modelURL);
const validation = await import(
  await compile('../src/lib/reading/universe/validate.ts', { './model': modelURL })
);
const { demoDataset, topicTemplate } = await import(
  await compile('../src/lib/reading/universe/demo.ts')
);
const { validateDataset, mergeDataset, readProgress, storageKey, safeUrl } = validation;
const demo = validateDataset(demoDataset);
assert.equal(demo.topics.length, 10);
const actual = validateDataset(topicTemplate);
assert(actual.topics.every((t) => t.status === 'unknown' && !t.isDemo));
let checks = 2;
for (const [label, mutate] of [
  ['duplicate ids', (d) => d.topics.push(d.topics[0])],
  ['missing relation', (d) => (d.topics[0].relatedTopicIds = ['missing'])],
  ['bad version', (d) => (d.schemaVersion = 2)],
  ['invalid status', (d) => (d.topics[0].status = 'done')],
  ['impossible date', (d) => (d.topics[0].date = '2026-02-31')],
  ['private in demo', (d) => (d.topics[0].isDemo = false)],
  ['bad dataset id', (d) => (d.datasetId = '__proto__')],
  [
    'unsafe link',
    (d) => (d.topics[0].references = [{ id: 'bad', title: 'Bad', url: 'javascript:alert(1)' }]),
  ],
  [
    'credential in URL',
    (d) =>
      (d.topics[0].artifacts = [{ id: 'bad', title: 'Bad', url: 'https://user:pass@example.com' }]),
  ],
  ['oversize note', (d) => (d.topics[0].notesMarkdown = 'x'.repeat(20001))],
  [
    'completedAt contradiction',
    (d) => {
      d.topics[0].status = 'unknown';
      d.topics[0].completedAt = '2026-10-01';
    },
  ],
]) {
  const value = structuredClone(demo);
  mutate(value);
  assert.throws(() => validateDataset(value), undefined, label);
  checks++;
}
const missing = structuredClone(actual);
delete missing.topics[0].status;
assert.equal(validateDataset(missing).topics[0].status, 'unknown');
checks++;
const old = demo.topics[0];
const complete = model.changeTopic(old, 'completed', 'Verified note', '2026-10-01T09:00:00.000Z');
assert.equal(complete.completedAt, complete.updatedAt);
const reopened = model.changeTopic(
  { ...old, ...complete },
  'in_progress',
  complete.notesMarkdown,
  '2026-10-01T10:00:00.000Z'
);
assert.equal(reopened.completedAt, null);
const roundtrip = readProgress(JSON.stringify({ [old.id]: complete }));
assert.deepEqual(roundtrip[old.id], complete);
checks += 3;
assert.notEqual(storageKey(demo), storageKey({ ...demo, datasetKind: 'private' }));
assert.throws(() => mergeDataset(actual, demo, 'keep'));
checks += 2;
const incoming = structuredClone(demo);
incoming.topics[0].notesMarkdown = 'imported note';
assert.equal(mergeDataset(demo, incoming, 'keep').topics[0].notesMarkdown, undefined);
assert.equal(mergeDataset(demo, incoming, 'replace').topics[0].notesMarkdown, 'imported note');
checks += 2;
assert.deepEqual(model.topicPosition('permanent-id'), model.topicPosition('permanent-id'));
assert.notDeepEqual(model.topicPosition('permanent-id'), model.topicPosition('another-id'));
checks += 2;
assert.equal(safeUrl('//evil.example'), null);
assert.equal(safeUrl('data:text/html,hello'), null);
checks += 2;
const weekly = JSON.parse(await readFile('tests/fixtures/reading-weekly/topics.json', 'utf8'));
const papers = Object.fromEntries(
  weekly.topics
    .flatMap((t) => t.reference_ids)
    .map((id) => [id, { id, title: 'Fixture paper', year: 2026 }])
);
const adapted = model.adaptWeekly({ universe: weekly, papers });
assert(
  adapted.topics.every(
    (t) =>
      t.status === 'unknown' && t.completedAt === null && t.date === null && t.results === undefined
  )
);
validateDataset(adapted);
checks += 2;

console.log(
  `Research universe: ${checks} data, import, privacy-boundary and progress checks passed (10 toy models).`
);

// Check that crystal / endcap wedges are closed, outward-facing solid volumes.
// Incorrect face winding makes the cutaway look hollow or disappear at angles.
const THREE = await import('three');
const { radialPrism } = await import(
  await compile('../src/components/reading/universe/scene/detectorGeometry.ts', {
    three: import.meta.resolve('three'),
  })
);
for (const [inner, outer, angle, depth] of [
  [0.79, 0.81, (Math.PI * 2) / 80, 2.58],
  [0.97, 1.25, ((Math.PI * 2) / 96) * 0.94, 0.118],
  [0.48, 2.55 / Math.cos(Math.PI / 8), (Math.PI / 4) * 0.99, 0.055],
]) {
  const geometry = radialPrism(inner, outer, angle, depth);
  const positions = geometry.getAttribute('position');
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  const expected = 0.5 * (outer ** 2 - inner ** 2) * Math.sin(angle) * depth;
  assert(volume > 0, 'Detector wedge face winding must point outward.');
  assert(Math.abs(volume - expected) < 1e-6, 'Detector wedge volume must match its dimensions.');
  assert([...geometry.getAttribute('normal').array].every(Number.isFinite));
  geometry.dispose();
}
console.log(
  'BESIII: 3 solid-geometry checks passed (MDC shell, crystal, octagonal endcap sector).'
);

const {
  teachingEvent,
  collisionPhase,
  flightTrack,
  COLLISION_PERIOD,
  COLLISION_TIMING,
  EVENT_STAGE_TIMES,
} = await import(await compile('../src/lib/reading/universe/collision.ts'));
const event = teachingEvent();
function closeMomentum(parent, children) {
  const sum = children.reduce((s, q) => ({ e: s.e + q.e, p: s.p.map((x, i) => x + q.p[i]) }), {
    e: 0,
    p: [0, 0, 0],
  });
  assert(Math.abs(parent.e - sum.e) < 1e-10, 'Decay must conserve energy.');
  parent.p.forEach((x, i) =>
    assert(Math.abs(x - sum.p[i]) < 1e-10, 'Decay must conserve momentum.')
  );
}
closeMomentum({ e: 3.773, p: [0, 0, 0] }, [event.d, event.dbar]);
const { positron, neutrino, hadronicSystem } = event.signal;
const signalMomenta = [hadronicSystem, positron, neutrino];
closeMomentum(event.d, signalMomenta);
closeMomentum(event.dbar, event.tag);
closeMomentum({ e: 3.773, p: [0, 0, 0] }, [...signalMomenta, ...event.tag]);
const mass2 = (q) => q.e * q.e - q.p.reduce((s, x) => s + x * x, 0);
assert(hadronicSystem.e > 0, 'The inclusive X system must have positive energy.');
assert(mass2(hadronicSystem) > 0, 'The inclusive X four-momentum must be timelike.');
assert(
  Math.abs(mass2(hadronicSystem) - 1.1 ** 2) < 1e-10,
  'The inclusive X system must retain the chosen teaching invariant mass.'
);
for (const [p, m] of [
  [event.d, 1.86484],
  [event.dbar, 1.86484],
  [positron, 0.000511],
  [neutrino, 0],
  [event.tag[0], 0.493677],
  [event.tag[1], 0.13957],
]) {
  assert(p.e > 0, 'All particles must have positive energies.');
  assert(Math.abs(mass2(p) - m * m) < 1e-10, 'All daughters must be on shell.');
}
for (const momentum of [...signalMomenta, ...event.tag, { p: [0, 0, 1] }]) {
  const origin = [0.2, -0.1, 0.3];
  const point = flightTrack(origin, momentum.p, 1.7);
  const displacement = point.map((x, i) => x - origin[i]);
  assert(Math.abs(Math.hypot(...displacement) - 1.7) < 1e-10);
  const p = momentum.p;
  const cross = [
    displacement[1] * p[2] - displacement[2] * p[1],
    displacement[2] * p[0] - displacement[0] * p[2],
    displacement[0] * p[1] - displacement[1] * p[0],
  ];
  assert(Math.hypot(...cross) < 1e-10, 'All flight tracks must remain collinear with momentum.');
}
assert.deepEqual(flightTrack([1, 2, 3], [0, 0, 0], 1), [1, 2, 3]);
assert.equal(COLLISION_PERIOD / 4, 4.8, 'Default playback must finish one event in 4.8 seconds.');
assert.equal(EVENT_STAGE_TIMES.length, 5);
for (const [stage, t] of EVENT_STAGE_TIMES.entries()) {
  assert.equal(collisionPhase(t).stage, stage);
  assert.equal(collisionPhase(t + COLLISION_PERIOD).stage, stage);
  assert.equal(collisionPhase(t).clearing, false, 'Manual stages must show a visible event.');
  assert.equal(collisionPhase(t).opacity, 1, 'Manual stages must show the complete event clearly.');
}
// Exercise the transition instants, not just comfortable points inside each phase.
// This catches a missing brief flash, late daughters, or a stale event at the loop seam.
const epsilon = 1e-6;
for (const [boundary, stage] of [
  [COLLISION_TIMING.beamEnd, 1],
  [COLLISION_TIMING.flashEnd, 2],
  [COLLISION_TIMING.pairEnd, 3],
  [COLLISION_TIMING.decayEnd, 4],
]) {
  assert.equal(collisionPhase(boundary - epsilon).stage, stage - 1);
  assert.equal(collisionPhase(boundary).stage, stage);
  assert.equal(collisionPhase(boundary + epsilon).stage, stage);
}
const injectionSeconds = COLLISION_TIMING.beamEnd / 4;
const decaySeconds = (COLLISION_TIMING.decayEnd - COLLISION_TIMING.pairEnd) / 4;
const fadeSeconds = (COLLISION_TIMING.clearStart - COLLISION_TIMING.fadeStart) / 4;
const clearSeconds = (COLLISION_PERIOD - COLLISION_TIMING.clearStart) / 4;
assert(injectionSeconds <= 0.4, 'Incoming beams must reach the collision quickly.');
assert(decaySeconds >= 2, 'Secondary decay must unfold slowly enough to follow.');
assert(decaySeconds >= injectionSeconds * 5, 'Decay must last much longer than injection.');
assert(fadeSeconds >= 1, 'Particles and tracks must fade visibly instead of vanishing suddenly.');
assert(clearSeconds > 0 && clearSeconds <= 0.15, 'Clear the event promptly after fading.');
assert.equal(collisionPhase(COLLISION_TIMING.fadeStart - epsilon).opacity, 1);
assert.equal(collisionPhase(COLLISION_TIMING.fadeStart).opacity, 1);
assert(Math.abs(collisionPhase(COLLISION_TIMING.fadeStart + epsilon).opacity - 1) < 1e-10);
assert(collisionPhase(COLLISION_TIMING.clearStart - epsilon).opacity < 1e-10);
assert.equal(collisionPhase(COLLISION_TIMING.clearStart).opacity, 0);
assert.equal(collisionPhase(COLLISION_TIMING.clearStart + epsilon).opacity, 0);
const fadeMidpoint = (COLLISION_TIMING.fadeStart + COLLISION_TIMING.clearStart) / 2;
assert(Math.abs(collisionPhase(fadeMidpoint).opacity - 0.5) < 1e-12);
let previousOpacity = 1;
for (let sample = 0; sample <= 20; sample++) {
  const time =
    COLLISION_TIMING.fadeStart +
    ((COLLISION_TIMING.clearStart - COLLISION_TIMING.fadeStart) * sample) / 20;
  const phase = collisionPhase(time);
  assert(phase.opacity >= 0 && phase.opacity <= previousOpacity, 'Fade must be monotonic.');
  collisionPhase(fadeMidpoint);
  collisionPhase(0);
  assert.equal(
    collisionPhase(time).opacity,
    phase.opacity,
    'Opacity must depend only on event time, without repeated-frame accumulation.'
  );
  previousOpacity = phase.opacity;
}
assert.equal(collisionPhase(COLLISION_TIMING.clearStart - epsilon).clearing, false);
assert.equal(collisionPhase(COLLISION_TIMING.clearStart).clearing, true);
assert.equal(collisionPhase(COLLISION_PERIOD - epsilon).clearing, true);
assert.equal(collisionPhase(COLLISION_PERIOD - epsilon).opacity, 0);
assert.deepEqual(collisionPhase(COLLISION_PERIOD), {
  time: 0,
  stage: 0,
  clearing: false,
  opacity: 1,
});
assert.equal(collisionPhase(COLLISION_PERIOD + epsilon).stage, 0);
assert.equal(collisionPhase(COLLISION_PERIOD + epsilon).clearing, false);
assert.equal(collisionPhase(COLLISION_PERIOD + epsilon).opacity, 1);
assert.equal(collisionPhase(-epsilon).opacity, 0);
const boards = JSON.parse(await readFile('src/lib/reading/universe/knowledge.json', 'utf8'));
assert.equal(boards.length, 8);
const katex = await import('katex');
let equations = 0;
for (const board of boards) {
  assert(board.steps.length >= 4 && board.equations && board.pdfPages);
  katex.default.renderToString(board.latex, { throwOnError: true, strict: 'error' });
  for (const step of board.steps) {
    for (const match of step.body.matchAll(/\$\$([\s\S]*?)\$\$|(?<!\$)\$([^$\n]+)\$(?!\$)/g)) {
      katex.default.renderToString(match[1] ?? match[2], { throwOnError: true, strict: 'error' });
      equations++;
    }
  }
}
console.log(
  `PASS: inclusive X system four-momentum conservation, timelike invariant mass, particle masses, straight flight directions, fast injection / slow decay, continuous fade, loop stages and ${equations} Mannel teaching formulas.`
);
