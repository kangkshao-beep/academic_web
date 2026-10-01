import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const credentials = { username: 'weekly-test', password: 'test-only-password' };
const credentialHash = createHash('sha256')
  .update(`${credentials.username}:${credentials.password}`, 'utf8')
  .digest('hex');
const screenshotDir =
  process.env.READING_WEEKLY_QA_OUTPUT_DIR || path.join(os.tmpdir(), 'reading-weekly-browser-qa');
const chromeCandidates = [
  process.env.READING_CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
assert(executablePath, 'Chrome/Chromium was not found.');
assert(
  existsSync(path.join(process.cwd(), 'out/reading/weekly/index.html')),
  'Run npm run build first.'
);
await mkdir(screenshotDir, { recursive: true });

let origin = '';
let serverOutput = '';
let serverError = '';
const server = spawn(process.execPath, ['scripts/serve-reading.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    READING_HOST: '127.0.0.1',
    READING_PORT: '0',
    READING_DATA_DIR: path.join(process.cwd(), 'tests/fixtures/reading'),
    READING_WEEKLY_DATA_DIR: path.join(process.cwd(), 'tests/fixtures/reading-weekly'),
    READING_WEEKLY_BASIC_AUTH_SHA256: credentialHash,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
  const match = /Reading test server listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(serverOutput);
  if (match) origin = match[1];
});
server.stderr.on('data', (chunk) => {
  serverError += chunk.toString();
});

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null)
      throw new Error(`Weekly test server exited early. ${serverError}`);
    if (origin) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Weekly test server did not become ready. ${serverError}`);
}

async function noHorizontalOverflow(page, label) {
  const result = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert(
    result.document <= result.viewport + 1,
    `${label} overflows (${result.document} > ${result.viewport}).`
  );
}

async function setLocale(page, option) {
  const toggle = page.locator('[data-testid="language-toggle"]:visible');
  await toggle.click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${option}`) }).click();
  await toggle.waitFor();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('data-testid') === 'language-toggle'
  );
  assert.equal(
    await toggle.evaluate((element) => element === document.activeElement),
    true,
    'Language selection did not restore focus.'
  );
}

async function showTopicIndex(page, open) {
  const toggle = page.getByTestId('topic-index-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== String(open)) await toggle.click();
  await page.getByTestId('topic-index').waitFor({ state: open ? 'visible' : 'hidden' });
}

function monitorPublicAccess(context) {
  const privateRequests = [];
  const challenges = [];
  context.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/reading/weekly/data/')) privateRequests.push(pathname);
  });
  context.on('response', (response) => {
    if (response.status() === 401 || response.headers()['www-authenticate']) {
      challenges.push({ pathname: new URL(response.url()).pathname, status: response.status() });
    }
  });
  return () => {
    assert.deepEqual(privateRequests, [], 'The public page must not request private weekly data.');
    assert.deepEqual(challenges, [], 'The public page must never trigger an auth challenge.');
  };
}

async function checkDetectorDock(page, sceneCanvas) {
  const scene = await sceneCanvas.boundingBox();
  const dock = await page.getByTestId('detector-dock').boundingBox();
  const view = await page.locator('.ru-detector-view').boundingBox();
  const detector = await page.getByTestId('detector-canvas').boundingBox();
  assert(dock && view && detector, 'The independent detector view must be visible.');
  assert(dock.x > scene.x && dock.x - scene.x < scene.width * 0.12);
  assert(dock.y - scene.y > scene.height * 0.4, 'The dock must stay in the lower-left corner.');
  assert(dock.x + dock.width < scene.x + scene.width);
  assert(dock.y + dock.height < scene.y + scene.height);
  const viewport = page.viewportSize();
  assert(Math.abs(detector.x) < 1 && Math.abs(detector.y) < 1);
  assert(Math.abs(detector.width - viewport.width) < 1);
  assert(Math.abs(detector.height - viewport.height) < 1);
  assert.equal(
    await page.getByTestId('detector-canvas').evaluate((e) => getComputedStyle(e).pointerEvents),
    'none',
    'The full-window render canvas must not capture background interactions.'
  );
  const target = await page.getByTestId('detector-canvas').evaluate((e) => ({
    x: Number(e.dataset.targetX),
    y: Number(e.dataset.targetY),
  }));
  assert(
    Math.abs(target.x - view.x - view.width / 2) < 1,
    'Default detector must use its dock centre.'
  );
  assert(
    Math.abs(target.y - view.y - view.height / 2) < 1,
    'Default detector must use its dock centre.'
  );
  return dock;
}

async function detectorHitBounds(page) {
  const bounds = JSON.parse(
    await page.getByTestId('detector-canvas').getAttribute('data-hit-bounds')
  );
  assert(['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key])));
  assert(bounds.width > 0 && bounds.height > 0, 'The detector needs a visible interaction area.');
  return bounds;
}

async function detectorInputPoint(page, outside) {
  const bounds = await detectorHitBounds(page);
  const point = await page.evaluate(
    ({ bounds, outside }) => {
      const left = Math.max(1, bounds.x);
      const top = Math.max(1, bounds.y);
      const right = Math.min(innerWidth - 1, bounds.x + bounds.width);
      const bottom = Math.min(innerHeight - 1, bounds.y + bounds.height);
      for (const yFraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        for (const xFraction of [0.5, 0.65, 0.35, 0.8, 0.2]) {
          const x = left + (right - left) * xFraction;
          const y = top + (bottom - top) * yFraction;
          if (
            outside &&
            x >= outside.x - 24 &&
            x <= outside.x + outside.width + 24 &&
            y >= outside.y - 24 &&
            y <= outside.y + outside.height + 24
          )
            continue;
          if (
            document.elementFromPoint(x, y)?.getAttribute('data-testid') === 'detector-interaction'
          )
            return { x, y };
        }
      }
      return null;
    },
    { bounds, outside }
  );
  assert(
    point,
    outside
      ? 'The enlarged detector must respond beyond its original dock.'
      : 'The detector must receive input inside its projected bounds.'
  );
  return point;
}

async function settledCamera(page, canvas) {
  let previous = await canvas.getAttribute('data-camera');
  let unchanged = 0;
  // Full-window SwiftShader rendering may need longer to dissipate orbit damping.
  // Sample more slowly than the 500 ms diagnostics interval, rather than using
  // one short fixed sleep as proof that a gesture has finished.
  for (let sample = 0; sample < 30; sample++) {
    await page.waitForTimeout(600);
    const current = await canvas.getAttribute('data-camera');
    unchanged = current === previous ? unchanged + 1 : 0;
    previous = current;
    if (unchanged >= 2) return current;
  }
  assert.fail('Camera damping did not settle after the gesture.');
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const anonymous = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const anonymousResponse = await anonymous.request.get(`${origin}/reading/weekly/`, {
    maxRedirects: 0,
  });
  assert.equal(anonymousResponse.status(), 200);
  assert.equal(anonymousResponse.headers()['www-authenticate'], undefined);
  assert.equal((await anonymousResponse.text()).includes('Synthetic current topic'), false);
  const privateDataResponse = await anonymous.request.get(
    `${origin}/reading/weekly/data/topics.json`
  );
  assert.equal(privateDataResponse.status(), 401, 'Private data must remain authenticated.');
  assert.equal((await privateDataResponse.text()).includes('Synthetic current topic'), false);
  await anonymous.close();

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const assertPublicAccess = monitorPublicAccess(context);
  await context.addInitScript(() => localStorage.setItem('locale-storage', 'en'));
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const publicPageResponse = await page.goto(`${origin}/reading/weekly/`, {
    waitUntil: 'networkidle',
  });
  assert.equal(publicPageResponse.status(), 200);
  const canvas = page.getByTestId('universe-canvas');
  const detectorCanvas = page.getByTestId('detector-canvas');
  const detectorInteraction = page.getByTestId('detector-interaction');
  const detectorDock = page.getByTestId('detector-dock');
  const showControls = async (open) => {
    const isOpen = (await page.locator('.ru-settings').getAttribute('open')) !== null;
    if (isOpen !== open) await page.getByLabel('Scene settings', { exact: true }).click();
  };
  await page.waitForFunction(
    () => document.querySelector('[data-testid="universe-canvas"]')?.dataset.nodes === '10'
  );
  assert.equal(await page.getByRole('combobox', { name: 'Data source' }).inputValue(), 'demo');
  assert.equal(
    await page
      .getByRole('combobox', { name: 'Data source' })
      .locator('option[value="private"]')
      .count(),
    0,
    'A public visitor must not be offered the old remote private source.'
  );
  assertPublicAccess();
  assert.equal(await page.getByTestId('topic-index-toggle').getAttribute('aria-expanded'), 'false');
  assert(await page.getByTestId('topic-index').isHidden(), 'Topic index must start collapsed.');
  const expandedSceneWidth = (await canvas.boundingBox()).width;
  await page.getByTestId('topic-index-toggle').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('topic-index').waitFor({ state: 'visible' });
  // The canvas adopts its new size in the ResizeObserver callback.
  await page.waitForFunction(
    (width) => document.querySelector('[data-testid="universe-canvas"]').clientWidth < width - 200,
    expandedSceneWidth
  );
  assert(
    (await canvas.boundingBox()).width < expandedSceneWidth - 200,
    'Collapsing the desktop index must return its width to the scene.'
  );
  assert.equal(await page.locator('[data-testid^="weekly-topic-demo-"]').count(), 10);
  const candidate = page.getByTestId('weekly-topic-demo-endpoint');
  await candidate.focus();
  await candidate.press('Enter');
  const modal = page.getByTestId('topic-modal');
  await modal.waitFor();
  await page.getByRole('heading', { name: 'Endpoint Smearing', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Work & checks' }).click();
  assert.equal(await modal.locator('ol > li').count(), 4);
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'detached' });
  assert.equal(await candidate.evaluate((e) => e === document.activeElement), true);
  await showTopicIndex(page, false);
  const angle = () => canvas.getAttribute('data-angle');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="detector-canvas"]')?.dataset.camera
  );
  const before = await angle();
  const detectorBefore = await detectorCanvas.getAttribute('data-detector-angle');
  await page.waitForTimeout(850);
  assert.notEqual(await angle(), before, 'Cloud must rotate in world coordinates.');
  assert.notEqual(
    await detectorCanvas.getAttribute('data-detector-angle'),
    detectorBefore,
    'Detector must rotate too.'
  );
  assert.equal(await detectorCanvas.getAttribute('data-collision-speed'), '4');
  const descriptionToggle = page.getByTestId('detector-description-toggle');
  const detectorDescription = page.locator('#detector-description');
  assert.equal(await descriptionToggle.getAttribute('aria-expanded'), 'false');
  assert(await detectorDescription.isHidden(), 'Detector event notes must start collapsed.');
  await descriptionToggle.focus();
  await page.keyboard.press('Enter');
  await detectorDescription.waitFor({ state: 'visible' });
  assert.equal(await descriptionToggle.getAttribute('aria-expanded'), 'true');
  const eventDescription = await detectorDescription.innerText();
  assert(eventDescription.includes('D⁰ → X e⁺ νₑ'));
  assert(eventDescription.includes('X denotes the total hadronic system'));
  const exclusiveSignalDescription = /X⁻|K[−⁻]\s*π[+⁺]\s*π[−⁻]|three(?: cyan)? hadron/i;
  assert.doesNotMatch(
    eventDescription,
    exclusiveSignalDescription,
    'Signal notes must describe the total X system without specifying K⁻ π⁺ π⁻ or three hadrons.'
  );
  await page.screenshot({
    path: path.join(screenshotDir, '20-detector-notes-expanded.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await detectorDescription.waitFor({ state: 'hidden' });
  assert(await descriptionToggle.evaluate((e) => e === document.activeElement));
  await page.keyboard.press('Space');
  await detectorDescription.waitFor({ state: 'visible' });
  await page.keyboard.press('Space');
  await detectorDescription.waitFor({ state: 'hidden' });
  assert.equal(
    await page.locator('.ru-detector-caption button, .ru-detector-caption summary').count(),
    1,
    'Only the event-note disclosure belongs below the detector; settings stay in Scene controls.'
  );
  assert.equal(
    await page.locator('.ru-detector-caption button').getAttribute('data-testid'),
    'detector-description-toggle'
  );
  await page.waitForTimeout(1800); // Sample after shader compilation and scene warm-up.
  const metrics = await canvas.evaluate((e) => ({
    fps: e.dataset.fps,
    drawCalls: e.dataset.drawCalls,
    nodes: e.dataset.nodes,
    gpu: e.getContext('webgl2')?.getParameter(e.getContext('webgl2').RENDERER),
  }));
  await page.getByLabel('Scene settings', { exact: true }).click();
  assert.equal(await page.getByLabel('Collision speed', { exact: true }).inputValue(), '4');
  await page.getByLabel('Collision speed', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="detector-canvas"]')?.dataset.collisionSpeed === '6'
  );
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByLabel('Collision speed', { exact: true }).inputValue(), '4');
  await page.getByRole('checkbox', { name: 'Rotate detector', exact: true }).uncheck();
  await page.waitForTimeout(650);
  const rotationOff = await detectorCanvas.getAttribute('data-detector-angle');
  const cloudStillRunning = await angle();
  await page.waitForTimeout(750);
  assert.equal(await detectorCanvas.getAttribute('data-detector-angle'), rotationOff);
  assert.notEqual(await angle(), cloudStillRunning);
  await page.getByRole('checkbox', { name: 'Rotate detector', exact: true }).check();
  await page.getByRole('combobox', { name: /^Direction/ }).selectOption('-1');
  const reverseStart = Number(await angle());
  await page.waitForTimeout(850);
  assert(Number(await angle()) < reverseStart, 'Reverse must rotate in the opposite direction.');
  await page.getByRole('combobox', { name: /^Direction/ }).selectOption('1');
  await page.getByLabel('Topic rotation speed', { exact: true }).focus();
  await page.keyboard.press('End');
  assert.equal(await page.getByLabel('Topic rotation speed', { exact: true }).inputValue(), '2');
  await page.getByRole('combobox', { name: /^Text orientation/ }).selectOption('exhibit');
  await page.getByRole('combobox', { name: /^Quality/ }).selectOption('low');
  await page.waitForTimeout(650);
  assert(await canvas.evaluate((e) => e.width <= e.getBoundingClientRect().width + 1));
  await page.getByRole('combobox', { name: /^Text orientation/ }).selectOption('read');
  await page.getByRole('combobox', { name: /^Quality/ }).selectOption('medium');
  await page.getByLabel('Scene settings', { exact: true }).click();
  await page.getByTestId('weekly-motion-toggle').click();
  await page.waitForTimeout(650);
  const paused = await angle();
  const pausedDetector = await detectorCanvas.getAttribute('data-detector-angle');
  assert(Number(await canvas.getAttribute('data-text-depth')) > 0.1);
  assert(Number(await canvas.getAttribute('data-text-side-vertices')) > 0);
  await page.waitForTimeout(750);
  assert.equal(await angle(), paused);
  assert.equal(await detectorCanvas.getAttribute('data-detector-angle'), pausedDetector);
  await page.screenshot({ path: path.join(screenshotDir, '01-default-scene.png'), fullPage: true });
  assert.equal(await page.locator('.ru-board-nav button').count(), 8);
  assert.equal(await canvas.getAttribute('data-boards'), '8');
  const boardEntry = page.getByTestId('board-path-integral');
  await boardEntry.focus();
  await boardEntry.press('Enter');
  const boardModal = page.getByTestId('knowledge-modal');
  await boardModal.waitFor();
  assert((await boardModal.locator('.katex').count()) > 5);
  assert.equal(await boardModal.locator('.katex-error').count(), 0);
  await page.screenshot({
    path: path.join(screenshotDir, '10-mannel-board-1.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert((await boardModal.textContent()).includes('Grassmann'));
  await page.screenshot({
    path: path.join(screenshotDir, '11-mannel-board-2.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert((await boardModal.textContent()).includes('Isgur'));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert(/dimension[- ]four|dimension[- ]4/i.test(await boardModal.textContent()));
  assert(
    !/[\u3400-\u9fff]/u.test(await boardModal.innerText()),
    'Blackboard must be fully English.'
  );
  assert.equal(await boardModal.locator('.katex-error').count(), 0);
  await boardModal.locator('.ru-board-scroll').evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await page.screenshot({
    path: path.join(screenshotDir, '12-mannel-board-4.png'),
    fullPage: true,
  });
  for (const [i, title] of [
    'Matching & running',
    'The first HQE parameters',
    'Why the mass scheme matters',
    'When the local expansion fails',
  ].entries()) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    assert((await boardModal.locator('h2').textContent()).includes(title));
    assert.equal(await boardModal.locator('.katex-error').count(), 0);
    assert((await boardModal.locator('.katex').count()) > 5);
    assert.equal(await boardModal.locator('.ru-board-scroll').evaluate((e) => e.scrollTop), 0);
    await page.screenshot({
      path: path.join(screenshotDir, `16-mannel-board-${i + 5}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  assert(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled());
  assert((await boardModal.locator('footer').textContent()).includes('8 / 8'));
  await page.mouse.click(8, 8);
  await boardModal.waitFor({ state: 'detached' });
  assert(await boardEntry.evaluate((e) => e === document.activeElement));
  // Select an actual projected blackboard through the canvas raycaster.
  const boardRect = await canvas.boundingBox();
  const boardPoint = await canvas.evaluate((e) => ({ x: +e.dataset.boardX, y: +e.dataset.boardY }));
  await page.mouse.click(boardRect.x + boardPoint.x, boardRect.y + boardPoint.y);
  await boardModal.waitFor();
  await page.keyboard.press('Escape');
  await boardModal.waitFor({ state: 'detached' });
  // The new lower row is independently pickable, below the original board row.
  const lowerPoint = await canvas.evaluate((e) => ({
    x: +e.dataset.lowerBoardX,
    y: +e.dataset.lowerBoardY,
  }));
  const thirdX = Number(await canvas.getAttribute('data-third-board-x'));
  assert(Math.abs(lowerPoint.x - thirdX) < 6, 'Lower board 1 must align with upper board 3.');
  assert(lowerPoint.x > boardPoint.x);
  const wall = JSON.parse(await canvas.getAttribute('data-board-bounds'));
  for (const board of wall) {
    assert(Math.abs(board.width - wall[0].width) < 1, 'All eight boards must have equal widths.');
    assert(
      Math.abs(board.height - wall[0].height) < 1,
      'All eight boards must have equal heights.'
    );
    assert(
      board.width / board.height > 1.15 && board.width / board.height < 1.6,
      'Boards must retain landscape proportions, without stretched strips.'
    );
    assert(board.x > 20 && board.y > 70, 'The wall must leave space for the scene header.');
    assert(board.x + board.width < boardRect.width - 20);
    assert(board.y + board.height < boardRect.height - 30);
  }
  const rowGap = wall[4].y - wall[0].y - wall[0].height;
  assert(rowGap >= 10 && rowGap <= 20, 'The staggered rows must remain close together.');
  const dockBounds = await checkDetectorDock(page, canvas);
  assert(
    dockBounds.width > boardRect.width * 0.14 && dockBounds.width < boardRect.width * 0.36,
    'The detector must remain legible without dominating the scene.'
  );
  // Pick exposed board space; foreground topic letters retain click priority.
  await page.mouse.click(
    boardRect.x + wall[4].x + wall[4].width * 0.13,
    boardRect.y + wall[4].y + wall[4].height * 0.15
  );
  await boardModal.waitFor();
  assert((await boardModal.locator('h2').textContent()).includes('Matching & running'));
  await page.keyboard.press('Escape');
  await boardModal.waitFor({ state: 'detached' });
  // Establish the default pose after earlier auto-rotation and sidebar resizes;
  // a fit at an arbitrary rotating pose is not the reset camera baseline.
  await page.getByRole('button', { name: 'Reset View', exact: true }).click();
  await page.waitForTimeout(900);
  const initialCamera = await canvas.getAttribute('data-camera');
  const initialDetectorCamera = await detectorCanvas.getAttribute('data-camera');
  const anchoredBoards = await canvas.getAttribute('data-board-bounds');
  const detectorRect = await page.locator('.ru-detector-view').boundingBox();
  await page.mouse.move(
    detectorRect.x + detectorRect.width * 0.72,
    detectorRect.y + detectorRect.height * 0.34
  );
  await page.mouse.down();
  await page.mouse.move(
    detectorRect.x + detectorRect.width * 0.42,
    detectorRect.y + detectorRect.height * 0.64,
    { steps: 16 }
  );
  await page.mouse.up();
  await page.waitForTimeout(900);
  const detectorAfterDrag = await detectorCanvas.getAttribute('data-camera');
  assert.notEqual(detectorAfterDrag, initialDetectorCamera, 'Dragging the detector must orbit it.');
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(await canvas.getAttribute('data-board-bounds'), anchoredBoards);
  const zoomBeforeWheel = Number(await detectorCanvas.getAttribute('data-zoom'));
  await page.mouse.wheel(0, -250);
  await page.waitForTimeout(900);
  assert(
    Number(await detectorCanvas.getAttribute('data-zoom')) > zoomBeforeWheel,
    'Scrolling over the detector must optically enlarge its independent view.'
  );
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(await canvas.getAttribute('data-board-bounds'), anchoredBoards);
  assert.equal(await modal.count(), 0, 'Manipulating the detector must not select a topic.');
  assert.equal(await boardModal.count(), 0, 'Manipulating the detector must not select a board.');
  await page.screenshot({
    path: path.join(screenshotDir, '19-independent-detector-orbit.png'),
    fullPage: true,
  });
  // Exercise real wheel input well beyond a fitted overview, then zoom again.
  // Optical zoom keeps the camera outside the instrument while enlarging detail.
  await detectorInteraction.focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(() => {
    const data = document.querySelector('[data-testid="detector-canvas"]')?.dataset;
    return Number(data?.zoom) === 1;
  });
  assert.equal(await detectorCanvas.getAttribute('data-camera'), initialDetectorCamera);
  const originalDetectorNode = await detectorCanvas.elementHandle();
  const originalProjection = JSON.parse(await detectorCanvas.getAttribute('data-detector-bounds'));
  const beforeExpansionTime = await detectorCanvas.getAttribute('data-event-time');
  let floatingPoint = await detectorInputPoint(page);
  await page.mouse.move(floatingPoint.x, floatingPoint.y);
  await page.mouse.wheel(0, -3000);
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) > 3
  );
  const expandedProjection = JSON.parse(await detectorCanvas.getAttribute('data-detector-bounds'));
  assert(expandedProjection.width > originalProjection.width * 2);
  assert(expandedProjection.height > originalProjection.height * 2);
  assert(
    expandedProjection.x + expandedProjection.width > detectorRect.x + detectorRect.width + 60 ||
      expandedProjection.y < detectorRect.y - 60,
    'Magnified detector geometry must visibly extend beyond the old clipped dock.'
  );
  assert(expandedProjection.width > page.viewportSize().width * 0.35);
  assert(await originalDetectorNode.evaluate((element) => element.isConnected));
  assert.equal(await detectorCanvas.getAttribute('data-event-time'), beforeExpansionTime);
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(await canvas.getAttribute('data-board-bounds'), anchoredBoards);
  assert.equal(await canvas.getAttribute('data-boards'), '8');
  assert.equal(await page.locator('.ru-board-nav button').count(), 8);
  await page.screenshot({
    path: path.join(screenshotDir, '25-detector-floating-expansion.png'),
    fullPage: true,
  });
  // Orbit through geometry beyond the former dock, rather than its old small rectangle.
  floatingPoint = await detectorInputPoint(page, detectorRect);
  const beforeFloatingDrag = await detectorCanvas.getAttribute('data-camera');
  await page.mouse.move(floatingPoint.x, floatingPoint.y);
  await page.mouse.down();
  await page.mouse.move(floatingPoint.x + 48, floatingPoint.y - 32, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  assert.notEqual(await detectorCanvas.getAttribute('data-camera'), beforeFloatingDrag);
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(await canvas.getAttribute('data-board-bounds'), anchoredBoards);
  assert.equal(await modal.count(), 0);
  assert.equal(await boardModal.count(), 0);
  await showControls(true);
  await page.getByRole('button', { name: 'Reset detector view', exact: true }).click();
  await showControls(false);
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) === 1
  );
  assert.equal(await detectorCanvas.getAttribute('data-camera'), initialDetectorCamera);
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(await canvas.getAttribute('data-board-bounds'), anchoredBoards);
  floatingPoint = await detectorInputPoint(page);
  await page.mouse.move(floatingPoint.x, floatingPoint.y);
  await page.mouse.wheel(0, -3000);
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) > 3
  );
  const floatingCamera = await settledCamera(page, detectorCanvas);
  const floatingZoom = await detectorCanvas.getAttribute('data-zoom');
  // Blackboard controls and dialogs must remain reachable above a large detector.
  await boardEntry.click();
  await boardModal.waitFor();
  assert(
    await boardModal.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      );
    })
  );
  await page.waitForTimeout(650);
  assert.equal(await detectorCanvas.getAttribute('data-camera'), floatingCamera);
  assert.equal(await detectorCanvas.getAttribute('data-zoom'), floatingZoom);
  await page.keyboard.press('Escape');
  await boardModal.waitFor({ state: 'detached' });
  // The transparent part of the fixed layer must pass input to the topic scene.
  const backgroundDrag = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (const yFraction of [0.2, 0.4, 0.6, 0.8]) {
      for (const xFraction of [0.85, 0.7, 0.55, 0.25]) {
        const x = rect.x + rect.width * xFraction;
        const y = rect.y + rect.height * yFraction;
        const end = { x: x + 44, y: y + 28 };
        if (
          document.elementFromPoint(x, y) === element &&
          document.elementFromPoint(end.x, end.y) === element
        )
          return { x, y, end };
      }
    }
    return null;
  });
  assert(backgroundDrag, 'A floating detector must leave the surrounding topic scene interactive.');
  await page.mouse.move(backgroundDrag.x, backgroundDrag.y);
  await page.mouse.down();
  await page.mouse.move(backgroundDrag.end.x, backgroundDrag.end.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const independentlyMovedCamera = await settledCamera(page, canvas);
  assert.notEqual(independentlyMovedCamera, initialCamera);
  assert.equal(await detectorCanvas.getAttribute('data-camera'), floatingCamera);
  assert.equal(await detectorCanvas.getAttribute('data-zoom'), floatingZoom);
  await detectorInteraction.focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) === 1
  );
  assert.equal(await detectorCanvas.getAttribute('data-camera'), initialDetectorCamera);
  assert.equal(await canvas.getAttribute('data-camera'), independentlyMovedCamera);
  await checkDetectorDock(page, canvas);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForFunction(
    (camera) =>
      document.querySelector('[data-testid="detector-canvas"]')?.dataset.camera !== camera,
    initialDetectorCamera
  );
  assert.equal(Number(await detectorCanvas.getAttribute('data-zoom')), 1);
  assert.equal(await canvas.getAttribute('data-camera'), independentlyMovedCamera);
  const pannedAtDefault = await detectorInputPoint(page, detectorRect);
  await page.mouse.move(pannedAtDefault.x, pannedAtDefault.y);
  await page.mouse.wheel(0, -250);
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) > 1
  );
  await detectorInteraction.focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) === 1
  );
  await page.getByRole('button', { name: 'Reset View', exact: true }).click();
  await page.waitForTimeout(900);
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  await page.mouse.move(
    detectorRect.x + detectorRect.width / 2,
    detectorRect.y + detectorRect.height / 2
  );
  await page.mouse.wheel(0, -9500);
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) > 30
  );
  const deepZoom = Number(await detectorCanvas.getAttribute('data-zoom'));
  const deepPoint = await detectorInputPoint(page);
  await page.mouse.move(deepPoint.x, deepPoint.y);
  await page.mouse.wheel(0, -2000);
  await page.waitForFunction((previous) => {
    const zoom = Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom);
    return zoom > 60 && zoom > previous * 1.5;
  }, deepZoom);
  const deeperZoom = Number(await detectorCanvas.getAttribute('data-zoom'));
  const beforePan = await detectorCanvas.getAttribute('data-camera');
  assert.equal(
    beforePan.split(',')[2],
    initialDetectorCamera.split(',')[2],
    'Optical magnification must not move the reset camera through the instrument.'
  );
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(await canvas.getAttribute('data-board-bounds'), anchoredBoards);
  // A close-up must be navigable without changing the topic scene or magnification.
  const panPoint = await detectorInputPoint(page);
  await page.mouse.move(panPoint.x, panPoint.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(panPoint.x + 35, panPoint.y - 18, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(900);
  const pannedCamera = await settledCamera(page, detectorCanvas);
  assert.notEqual(pannedCamera, beforePan, 'Right-drag must pan a detector close-up.');
  assert.equal(Number(await detectorCanvas.getAttribute('data-zoom')), deeperZoom);
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(await canvas.getAttribute('data-board-bounds'), anchoredBoards);
  const beforeResize = page.viewportSize();
  await page.setViewportSize({ ...beforeResize, width: beforeResize.width + 120 });
  await page.waitForTimeout(900);
  assert.equal(Number(await detectorCanvas.getAttribute('data-zoom')), deeperZoom);
  assert.equal(await detectorCanvas.getAttribute('data-camera'), pannedCamera);
  await page.setViewportSize(beforeResize);
  await page.waitForTimeout(900);
  assert.equal(Number(await detectorCanvas.getAttribute('data-zoom')), deeperZoom);
  assert.equal(await detectorCanvas.getAttribute('data-camera'), pannedCamera);
  await detectorInteraction.focus();
  await page.keyboard.press('-');
  await page.waitForFunction(
    (zoom) =>
      Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) < zoom,
    deeperZoom
  );
  const keyboardZoom = Number(await detectorCanvas.getAttribute('data-zoom'));
  await page.keyboard.press('=');
  await page.waitForFunction(
    (zoom) =>
      Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) > zoom,
    keyboardZoom
  );
  await page.keyboard.press('Home');
  await page.waitForFunction(() => {
    const data = document.querySelector('[data-testid="detector-canvas"]')?.dataset;
    return Number(data?.zoom) === 1;
  });
  assert.equal(await detectorCanvas.getAttribute('data-camera'), initialDetectorCamera);
  await page.getByRole('button', { name: 'Reset View', exact: true }).click();
  await page.waitForTimeout(900);
  assert.equal(await detectorCanvas.getAttribute('data-camera'), initialDetectorCamera);
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  await showControls(true);
  await page.getByTestId('event-stage-4').click();
  await showControls(false);
  await page.waitForFunction(
    () => document.querySelector('[data-testid="detector-canvas"]')?.dataset.eventStage === '4'
  );
  await page.screenshot({
    path: path.join(screenshotDir, '23-signal-dock.png'),
    fullPage: true,
  });
  await showControls(true);
  await page
    .getByRole('button', { name: 'Inspect detector', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(screenshotDir, '17-scene-controls.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Inspect detector', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="detector-canvas"]')?.dataset.view === 'detector'
  );
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  const expandedDock = await detectorDock.boundingBox();
  assert(expandedDock.width > dockBounds.width * 1.8);
  assert(expandedDock.height > dockBounds.height * 1.5);
  for (let i = 0; i < 5; i++) {
    await showControls(true);
    await page.getByTestId(`event-stage-${i}`).click();
    await showControls(false);
    await page.waitForFunction((stage) => {
      const data = document.querySelector('[data-testid="detector-canvas"]')?.dataset;
      return (
        data?.eventStage === String(stage) &&
        Number(data.eventTime) === [0.8, 1.8, 3.6, 9.6, 14.4][stage]
      );
    }, i);
    const heldTime = await detectorCanvas.getAttribute('data-event-time');
    await page.waitForTimeout(650);
    assert.equal(await detectorCanvas.getAttribute('data-event-time'), heldTime);
    if (i === 3) {
      assert.equal(await page.locator('.ru-event-explainer h3').innerText(), 'D⁰ → X e⁺ νₑ');
      const explanation = await page.locator('.ru-event-explainer p').innerText();
      assert(explanation.includes('one cyan X direction'));
      assert(explanation.includes('gold positron'));
      assert.doesNotMatch(
        explanation,
        exclusiveSignalDescription,
        'The signal stage must show one total X direction without resolving individual hadrons.'
      );
    }
    await page.screenshot({
      path: path.join(screenshotDir, `13-collision-stage-${i}.png`),
      fullPage: true,
    });
  }
  // Keep the completed event still and magnify an actual secondary vertex.
  await page.waitForFunction(() => {
    const data = document.querySelector('[data-testid="detector-canvas"]')?.dataset;
    return data?.eventStage === '4' && data.decayVertices;
  });
  const closeupRect = await detectorCanvas.boundingBox();
  const zoomAtDecayVertex = async (delta) => {
    const vertices = JSON.parse(await detectorCanvas.getAttribute('data-decay-vertices'));
    assert.equal(vertices.length, 2, 'Both secondary decay vertices must be available.');
    const vertex = vertices[0];
    assert(Number.isFinite(vertex.x) && Number.isFinite(vertex.y));
    assert(vertex.x > 0 && vertex.x < closeupRect.width);
    assert(vertex.y > 0 && vertex.y < closeupRect.height);
    await page.mouse.move(vertex.x, vertex.y);
    await page.mouse.wheel(0, delta);
  };
  await zoomAtDecayVertex(-4500);
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) > 4
  );
  await page.screenshot({
    path: path.join(screenshotDir, '21-decay-closeup.png'),
    fullPage: true,
  });
  await zoomAtDecayVertex(-5000);
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) > 30
  );
  await page.screenshot({
    path: path.join(screenshotDir, '22-secondary-vertex-closeup.png'),
    fullPage: true,
  });
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(await detectorCanvas.getAttribute('data-event-stage'), '4');
  await detectorInteraction.focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="detector-canvas"]')?.dataset.zoom) === 1
  );
  await showControls(true);
  await page.getByRole('button', { name: 'Loop ↻', exact: true }).click();
  await showControls(false);
  await page.mouse.move(20, 20);
  await page.waitForTimeout(650);
  const observedStages = new Set();
  const automaticFrames = [];
  let fadeScreenshotSaved = false;
  const movesWhileFading = () =>
    automaticFrames.some((frame, index) => {
      const previous = automaticFrames[index - 1];
      return (
        previous &&
        Math.floor(frame.time / 19.2) === Math.floor(previous.time / 19.2) &&
        previous.progress > 1 &&
        frame.progress > previous.progress &&
        frame.opacity > 0 &&
        frame.opacity < 1
      );
    });
  const startRotation = Number(await detectorCanvas.getAttribute('data-detector-angle'));
  const startEventTime = Number(await detectorCanvas.getAttribute('data-event-time'));
  for (let tick = 0; tick < 200; tick++) {
    observedStages.add(
      await page
        .locator('.ru-event-phases [data-testid][aria-pressed="true"]')
        .getAttribute('data-testid')
    );
    const frame = await detectorCanvas.evaluate((element) => ({
      time: Number(element.dataset.eventTime),
      opacity: Number(element.dataset.eventOpacity),
      progress: Number(element.dataset.daughterProgress),
    }));
    if (frame.time !== automaticFrames.at(-1)?.time) automaticFrames.push(frame);
    if (!fadeScreenshotSaved && frame.opacity >= 0.3 && frame.opacity <= 0.9) {
      await page.screenshot({
        path: path.join(screenshotDir, '24-decay-fade.png'),
        fullPage: true,
      });
      fadeScreenshotSaved = true;
    }
    if (observedStages.size === 5 && fadeScreenshotSaved && movesWhileFading()) break;
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(650);
  const rotationDelta =
    Number(await detectorCanvas.getAttribute('data-detector-angle')) - startRotation;
  const eventDelta = Number(await detectorCanvas.getAttribute('data-event-time')) - startEventTime;
  assert(rotationDelta > 0 && eventDelta > 0);
  assert(
    Math.abs(rotationDelta / eventDelta - 0.03 / 4) < 0.0002,
    'Detector should rotate very slowly on an independent clock while collisions run at 4x.'
  );
  assert.equal(
    observedStages.size,
    5,
    'Automatic loop must reach all five collision/decay stages.'
  );
  assert(
    automaticFrames.some((frame) => frame.opacity > 0 && frame.opacity < 1),
    'Automatic playback must expose a visible fade instead of an abrupt clear.'
  );
  assert(
    movesWhileFading(),
    'Daughter heads must keep moving beyond the detector boundary during the fade.'
  );
  assert(fadeScreenshotSaved, 'Capture the visible fade for visual inspection.');
  await page.getByTestId('weekly-motion-toggle').click();
  const inspectedPoint = await detectorInputPoint(page);
  await page.mouse.click(inspectedPoint.x, inspectedPoint.y);
  assert.equal(await modal.count(), 0, 'Detector inspection must not pick hidden topic nodes.');
  await page.screenshot({
    path: path.join(screenshotDir, '07-detector-closeup.png'),
    fullPage: true,
  });
  await showControls(true);
  await page.getByRole('button', { name: 'MUC', exact: true }).click();
  assert.equal(
    await page.getByRole('button', { name: 'MUC', exact: true }).getAttribute('aria-pressed'),
    'false'
  );
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="detector-canvas"]')?.dataset.hiddenLayers?.includes('4')
  );
  await showControls(false);
  await page.screenshot({
    path: path.join(screenshotDir, '08-detector-inner-layers.png'),
    fullPage: true,
  });
  await showControls(true);
  await page.getByRole('button', { name: 'MUC', exact: true }).click();
  await page.getByRole('button', { name: 'Reset View', exact: true }).click();
  await page.waitForFunction((camera) => {
    const data = document.querySelector('[data-testid="detector-canvas"]')?.dataset;
    return data?.view === 'dock' && data.camera === camera;
  }, initialDetectorCamera);
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(await detectorCanvas.getAttribute('data-camera'), initialDetectorCamera);
  await page.getByText('Official video & geometry references', { exact: true }).click();
  assert.equal(
    await page
      .getByRole('link', { name: 'IHEP video · Science in Focus: BEPC', exact: false })
      .getAttribute('href'),
    'https://ihep.cas.cn/kxcb/spdh/201510/t20151016_4439808.html'
  );
  await page.getByText('Official video & geometry references', { exact: true }).click();
  await showControls(false);
  const rect = await canvas.boundingBox();
  const detectorBeforeSceneDrag = await detectorCanvas.getAttribute('data-camera');
  await page.mouse.move(rect.x + rect.width * 0.72, rect.y + rect.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.45, rect.y + rect.height * 0.56, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  assert.equal(await modal.count(), 0, 'Dragging must not open a topic.');
  assert.notEqual(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(
    await detectorCanvas.getAttribute('data-camera'),
    detectorBeforeSceneDrag,
    'Dragging the topic scene must not rotate the independent detector camera.'
  );
  await page.screenshot({
    path: path.join(screenshotDir, '02-alternate-angle.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Reset View', exact: true }).click();
  await page.waitForTimeout(900);
  assert.equal(await canvas.getAttribute('data-camera'), initialCamera);
  assert.equal(await detectorCanvas.getAttribute('data-camera'), initialDetectorCamera);
  await page.getByTestId('weekly-motion-toggle').click();
  const hoverRect = await canvas.boundingBox();
  const point = await canvas.evaluate((e) => ({ x: +e.dataset.firstX, y: +e.dataset.firstY }));
  await page.mouse.move(hoverRect.x + point.x, hoverRect.y + point.y);
  await page.waitForTimeout(700);
  assert(await canvas.getAttribute('data-hovered'), '3D ray picking must find a topic.');
  const held = await angle();
  await page.waitForTimeout(700);
  assert.equal(await angle(), held, 'Hover must hold the rotating cloud.');
  await page.mouse.click(hoverRect.x + point.x, hoverRect.y + point.y);
  await modal.waitFor();
  await page.waitForTimeout(600);
  const modalAngle = await angle();
  await page.waitForTimeout(700);
  assert.equal(await angle(), modalAngle);
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'detached' });
  await page.mouse.move(20, 20);
  await page.getByTestId('weekly-motion-toggle').click();
  await showTopicIndex(page, true);
  await page.getByTestId('weekly-topic-demo-endpoint').click();
  await modal.waitFor();
  assert.equal((await modal.locator('.katex').count()) > 0, true, 'LaTeX must be typeset.');
  await page.screenshot({ path: path.join(screenshotDir, '03-topic-detail.png'), fullPage: true });
  await page.getByTestId('topic-complete').click();
  await page.getByRole('button', { name: 'Reopen topic', exact: true }).waitFor();
  await page.screenshot({
    path: path.join(screenshotDir, '04-completed-topic.png'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('prism-research-universe:mode', 'private'));
  await page.reload({ waitUntil: 'networkidle' });
  // Retired private-source preferences migrate without losing local DEMO progress.
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="universe-canvas"]')?.dataset.nodes === '10' &&
      localStorage.getItem('prism-research-universe:mode') === 'demo'
  );
  assert.equal(await page.getByRole('combobox', { name: 'Data source' }).inputValue(), 'demo');
  assertPublicAccess();
  await showTopicIndex(page, true);
  await page.getByTestId('weekly-topic-demo-endpoint').click();
  await page.getByRole('button', { name: 'Reopen topic', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Progress & notes' }).click();
  await page
    .getByRole('textbox', { name: 'Private notes', exact: true })
    .fill('DEMO note: $\\nu_e$ and **checks**. <script>window.bad=true</script>');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  assert.equal(await page.evaluate(() => window.bad), undefined);
  await page.keyboard.press('Escape');
  const dlEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const dl = await dlEvent;
  const backup = JSON.parse(
    await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8')
  );
  assert.equal(backup.datasetKind, 'demo');
  assert.equal(backup.topics.find((t) => t.id === 'demo-endpoint').status, 'completed');
  assert(backup.topics.find((t) => t.id === 'demo-endpoint').notesMarkdown.includes('DEMO note'));
  await page.getByTestId('weekly-topic-demo-endpoint').click();
  await page.getByRole('button', { name: 'Reopen topic', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: 'Search topics', exact: true }).fill('zzzz-no-match');
  await page.getByText('No topics match. Clear your filters to explore again.').waitFor();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Status filter', exact: true })
    .selectOption('completed');
  assert.equal(await page.locator('[data-testid^="weekly-topic-demo-"]').count(), 2);
  await page.getByRole('combobox', { name: 'Status filter', exact: true }).selectOption('');

  const importData = structuredClone(backup);
  importData.datasetId = 'demo-import-test';
  importData.topics[0].shortTitle = 'Imported endpoint';
  await page.getByTestId('universe-import').setInputFiles({
    name: 'demo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importData)),
  });
  await page.getByRole('region', { name: 'Review import', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Merge · keep existing', exact: true }).click();
  await page.getByTestId('weekly-topic-demo-endpoint').waitFor();
  assert.equal(
    await page
      .getByTestId('weekly-topic-demo-endpoint')
      .innerText()
      .then((t) => t.includes('Imported endpoint')),
    false
  );
  await page.getByRole('combobox', { name: 'Data source', exact: true }).selectOption('demo');
  await setLocale(page, '简体中文');
  await page.getByRole('heading', { name: '课题宇宙', exact: false }).waitFor();
  await page.getByTestId('board-path-integral').click();
  await boardModal.waitFor();
  assert((await boardModal.locator('h2').innerText()).includes('From QCD to slow fields'));
  assert(
    !/[\u3400-\u9fff]/u.test(await boardModal.innerText()),
    'Changing site locale must keep Mannel boards English.'
  );
  await page.keyboard.press('Escape');
  await page.getByTestId('weekly-topic-demo-endpoint').click();
  await page.getByRole('heading', { name: '端点涂抹', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: path.join(screenshotDir, '05-simplified-chinese.png'),
    fullPage: true,
  });
  await setLocale(page, '繁體中文（香港）');
  await page.getByRole('heading', { name: '課題宇宙', exact: false }).waitFor();
  await showTopicIndex(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalOverflow(page, '390px Traditional Chinese');
  await showTopicIndex(page, true);
  await page.getByTestId('weekly-topic-demo-endpoint').click();
  await modal.waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByTestId('topic-index-toggle').getAttribute('aria-expanded'), 'false');
  assert(
    await page.getByTestId('topic-index-toggle').evaluate((e) => e === document.activeElement)
  );
  await checkDetectorDock(page, canvas);
  assert.equal(await descriptionToggle.getAttribute('aria-expanded'), 'false');
  await page.screenshot({ path: path.join(screenshotDir, '06-mobile.png'), fullPage: true });
  await page.getByLabel('場景設定', { exact: true }).click();
  await page.getByTestId('event-stage-3').click();
  await noHorizontalOverflow(page, '390px Scene controls');
  assert(
    await page.locator('.ru-settings-panel').evaluate((e) => {
      const r = e.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth;
    })
  );
  await page.screenshot({
    path: path.join(screenshotDir, '18-mobile-controls.png'),
    fullPage: true,
  });
  await page.getByLabel('場景設定', { exact: true }).click();
  await page.getByTestId('board-inclusive-ope').click();
  await boardModal.waitFor();
  assert.equal(await boardModal.locator('.katex-error').count(), 0);
  assert(await boardModal.evaluate((e) => e.getBoundingClientRect().right <= window.innerWidth));
  await page.screenshot({
    path: path.join(screenshotDir, '14-mobile-blackboard.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await boardModal.waitFor({ state: 'detached' });
  assert.equal(
    pageErrors.length,
    0,
    `Page errors: ${[...new Set(pageErrors)].slice(0, 3).join(' | ')}`
  );
  assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join(' | ')}`);
  assertPublicAccess();
  await context.close();
  const reduced = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const assertReducedPublicAccess = monitorPublicAccess(reduced);
  const rp = await reduced.newPage();
  let releaseFormulas;
  const formulasReleased = new Promise((resolve) => {
    releaseFormulas = resolve;
  });
  await rp.route('**/research-universe/formulas/*.svg', async (route) => {
    await formulasReleased;
    await route.continue();
  });
  await rp.goto(`${origin}/reading/weekly/`, { waitUntil: 'domcontentloaded' });
  await rp.waitForFunction(
    () => document.querySelector('[data-testid="universe-canvas"]')?.dataset.nodes === '10'
  );
  const beforeFormulas = await rp.getByTestId('universe-canvas').screenshot();
  releaseFormulas();
  await rp.waitForLoadState('networkidle');
  const afterFormulas = await rp
    .getByTestId('universe-canvas')
    .screenshot({ path: path.join(screenshotDir, '09-reduced-motion-formulas.png') });
  assert(
    !beforeFormulas.equals(afterFormulas),
    'Late formula textures must repaint a motion-reduced scene.'
  );
  const reducedAngle = await rp.getByTestId('universe-canvas').getAttribute('data-angle');
  const reducedDetector = await rp
    .getByTestId('detector-canvas')
    .getAttribute('data-detector-angle');
  assert.equal(reducedDetector, '1.0500');
  await rp.waitForTimeout(750);
  assert.equal(await rp.getByTestId('universe-canvas').getAttribute('data-angle'), reducedAngle);
  assert.equal(await rp.getByTestId('detector-canvas').getAttribute('data-event-stage'), '4');
  assert.equal(
    await rp.getByTestId('detector-canvas').getAttribute('data-detector-angle'),
    reducedDetector,
    'Reduced motion must also hold the independently rendered detector.'
  );
  await rp.getByLabel('Scene settings', { exact: true }).click();
  await rp.getByTestId('event-stage-0').click();
  await rp.getByLabel('Scene settings', { exact: true }).click();
  await rp.waitForFunction(
    () => document.querySelector('[data-testid="detector-canvas"]')?.dataset.eventStage === '0'
  );
  await rp.getByTestId('board-integrate-out').click();
  await rp.getByTestId('knowledge-modal').waitFor();
  assert.equal(await rp.getByTestId('knowledge-modal').locator('.katex-error').count(), 0);
  assertReducedPublicAccess();
  await reduced.close();
  const fallback = await browser.newContext();
  const assertFallbackPublicAccess = monitorPublicAccess(fallback);
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return original.call(this, type, ...args);
    };
  });
  const fp = await fallback.newPage();
  await fp.goto(`${origin}/reading/weekly/`, { waitUntil: 'networkidle' });
  await fp.getByText('WebGL is unavailable.', { exact: false }).waitFor();
  await showTopicIndex(fp, true);
  await fp.getByTestId('weekly-topic-demo-endpoint').click();
  await fp.getByTestId('topic-modal').waitFor();
  await fp.keyboard.press('Escape');
  await fp.getByTestId('board-symmetry').click();
  await fp.getByTestId('knowledge-modal').waitFor();
  assertFallbackPublicAccess();
  await fallback.close();
  const report = {
    result: 'PASS',
    checkedAt: new Date().toISOString(),
    browser: await browser.version(),
    platform: os.platform(),
    arch: os.arch(),
    rendererNote: 'Headless Chromium using software SwiftShader; not a hardware GPU benchmark.',
    metrics,
    automaticDecay: {
      sampleCount: automaticFrames.length,
      fadingFrames: automaticFrames
        .filter((frame) => frame.opacity > 0 && frame.opacity < 1)
        .slice(0, 8),
      continuedMotionFrames: automaticFrames.filter((frame) => frame.progress > 1).slice(0, 8),
      movesWhileFading: movesWhileFading(),
    },
    screenshots: screenshotDir,
    coverage:
      'Anonymous public weekly entry with 10 toy models, private API still authenticated, no private UI fetches or auth challenges, retired private source migration preserving local progress, eight Mannel blackboards (raycast/keyboard/backdrop/Esc/focus/mobile/fallback), straight tracks, total hadronic X signal description with one cyan X direction and gold positron, no exclusive three-hadron channel in event notes or signal stage, equal landscape blackboards with staggered rows, centered independent lower-left detector dock on desktop/mobile, collapsed event-note disclosure with keyboard/Escape/focus, independent full-window detector overlay growing beyond the dock, outside-dock orbit and transparent-background click-through, modal layering, Escape restoration, isolated detector orbit/optical zoom beyond 60x/right-drag pan, zoom retention on resize, keyboard zoom/Home, secondary-vertex close-ups, independent topic-scene orbit, unchanged board bounds during detector manipulation, extruded glyph geometry, five held collision stages, fast injection / slow decay, 4.8-second automatic loop, visible fade with continuously moving daughter heads, independent slow detector rotation and pause, consolidated scene controls, expanded detector view without moving the main camera/layers/reset/source links, speed/direction/quality, drag, hover, modal/focus, progress reload/reopen, notes/math, export/import, 10 toy models, 3 locales, 390px, reduced motion and delayed formula repaint, WebGL fallback',
  };
  await writeFile(path.join(screenshotDir, 'verification.json'), JSON.stringify(report, null, 2));
  await rm(path.join(screenshotDir, 'failure.png'), { force: true });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (browser) {
    const page = browser.contexts().flatMap((c) => c.pages())[0];
    if (page)
      await page
        .screenshot({ path: path.join(screenshotDir, 'failure.png'), fullPage: true })
        .catch(() => {});
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
}
