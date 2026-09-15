import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const scannerPath = path.join(projectRoot, 'scripts', 'scan-reading-leaks.mjs');
const privateDir = await mkdtemp(path.join(os.tmpdir(), 'reading-weekly-leak-private-'));
const historyRepo = await mkdtemp(path.join(os.tmpdir(), 'reading-weekly-leak-history-'));
const probeName = `weekly-private-probe-${process.pid}.md`;
const probePath = path.join(projectRoot, probeName);
const outputProbeName = `weekly-private-probe-${process.pid}.html`;
const outputProbePath = path.join(projectRoot, 'out', outputProbeName);
const canary = ['SYNTHETIC', 'WEEKLY', 'PRIVATE', 'CANARY', '4f8a21'].join('_');
const weeklyFile = path.join(privateDir, 'topics.json');
const privateTopicId = ['weekly', 'synthetic', 'private', 'probe'].join('-');
const privateValue = (label) => [canary, label].join('_');

function weeklyFixture() {
  return {
    current_topic_id: privateTopicId,
    topics: [{
      id: privateTopicId,
      locales: {
        en: {
          title: {
            before: ['Syn', 'thetic'].join(''),
            focus: ['Pri', 'vate'].join(''),
            after: ['Pro', 'be'].join(''),
          },
          eyebrow: privateValue('EYEBROW'),
          question: canary,
          why_now: privateValue('WHY'),
          scope: privateValue('SCOPE'),
          plan: [{ label: privateValue('LABEL'), body: privateValue('PLAN') }],
          deliverable: privateValue('DELIVERABLE'),
          guardrail: privateValue('GUARDRAIL'),
        },
      },
    }],
  };
}

function scan(cwd = projectRoot) {
  return spawnSync(process.execPath, [scannerPath], {
    cwd,
    env: { ...process.env, READING_WEEKLY_PRIVATE_DATA_FILE: weeklyFile },
    encoding: 'utf8',
  });
}

function assertCanaryHidden(result) {
  assert.equal(result.stdout.includes(canary), false, 'Scanner printed the weekly canary to stdout.');
  assert.equal(result.stderr.includes(canary), false, 'Scanner printed the weekly canary to stderr.');
}

try {
  await writeFile(weeklyFile, JSON.stringify(weeklyFixture()), { mode: 0o600 });

  const clean = scan();
  assert.equal(clean.status, 0, `Clean weekly scan failed: ${clean.stderr}`);
  assertCanaryHidden(clean);

  await writeFile(probePath, `${canary}\n`, { mode: 0o600 });
  const tracked = scan();
  assert.notEqual(tracked.status, 0, 'Scanner accepted a weekly canary in a tracked candidate.');
  assert.match(tracked.stderr, new RegExp(`tracked file ${probeName}`));
  assertCanaryHidden(tracked);
  await rm(probePath, { force: true });

  await mkdir(path.dirname(outputProbePath), { recursive: true });
  await writeFile(outputProbePath, `<p>${canary}</p>\n`, { mode: 0o600 });
  const generated = scan();
  assert.notEqual(generated.status, 0, 'Scanner accepted a weekly canary in generated output.');
  assert.match(generated.stderr, new RegExp(`out/${outputProbeName}`));
  assertCanaryHidden(generated);
  await rm(outputProbePath, { force: true });

  execFileSync('git', ['init', '-q'], { cwd: historyRepo });
  execFileSync('git', ['config', 'user.name', 'Synthetic Test'], { cwd: historyRepo });
  execFileSync('git', ['config', 'user.email', 'synthetic@example.invalid'], { cwd: historyRepo });
  const historicalProbe = path.join(historyRepo, 'historical-probe.md');
  await writeFile(historicalProbe, `${canary}\n`, { mode: 0o600 });
  execFileSync('git', ['add', 'historical-probe.md'], { cwd: historyRepo });
  execFileSync('git', ['commit', '-q', '-m', 'synthetic leak'], { cwd: historyRepo });
  await rm(historicalProbe, { force: true });
  execFileSync('git', ['add', '-u'], { cwd: historyRepo });
  execFileSync('git', ['commit', '-q', '-m', 'remove synthetic leak'], { cwd: historyRepo });

  const historical = scan(historyRepo);
  assert.notEqual(historical.status, 0, 'Scanner accepted a weekly canary retained only in Git history.');
  assert.match(historical.stderr, /found in reachable Git history/);
  assertCanaryHidden(historical);

  process.stdout.write('Weekly leak-scanner self-test passed (tracked, generated, and reachable-history leaks rejected without printing values).\n');
} finally {
  await rm(probePath, { force: true });
  await rm(outputProbePath, { force: true });
  await rm(privateDir, { recursive: true, force: true });
  await rm(historyRepo, { recursive: true, force: true });
}
