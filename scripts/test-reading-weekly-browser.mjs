import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const credentials = { username: 'weekly-test', password: 'test-only-password' };
const credentialHash = createHash('sha256')
  .update(`${credentials.username}:${credentials.password}`, 'utf8')
  .digest('hex');
const screenshotDir = process.env.READING_WEEKLY_QA_OUTPUT_DIR
  || path.join(os.tmpdir(), 'reading-weekly-browser-qa');
const chromeCandidates = [
  process.env.READING_CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
assert(executablePath, 'Chrome/Chromium was not found.');
assert(existsSync(path.join(process.cwd(), 'out/reading/weekly/index.html')), 'Run npm run build first.');
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
server.stderr.on('data', (chunk) => { serverError += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Weekly test server exited early. ${serverError}`);
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
  assert(result.document <= result.viewport + 1, `${label} overflows (${result.document} > ${result.viewport}).`);
}

async function setLocale(page, option) {
  const toggle = page.locator('[data-testid="language-toggle"]:visible');
  await toggle.click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${option}`) }).click();
  await toggle.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'language-toggle');
  assert.equal(await toggle.evaluate((element) => element === document.activeElement), true, 'Language selection did not restore focus.');
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath, headless: true });

  const anonymous = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const anonymousResponse = await anonymous.request.get(`${origin}/reading/weekly/`, { maxRedirects: 0 });
  assert.equal(anonymousResponse.status(), 401);
  assert.equal((await anonymousResponse.text()).includes('Synthetic current topic'), false);
  await anonymous.close();

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    httpCredentials: { ...credentials, send: 'unauthorized' },
  });
  await context.addInitScript(() => localStorage.setItem('locale-storage', 'en'));
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const publicLibraryAuthorizationMarkers = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (pageResponse) => {
    if (new URL(pageResponse.url()).pathname === '/reading/data/library.json') {
      publicLibraryAuthorizationMarkers.push(
        pageResponse.headerValue('x-reading-test-authorization')
      );
    }
  });

  const response = await page.goto(`${origin}/reading/weekly/`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200);
  await page.locator('[data-testid="weekly-universe-app"]').waitFor();
  assert.equal(await page.locator('[data-testid^="weekly-topic-weekly-"]').count(), 4);
  assert.equal(await page.getByText('Synthetic current topic', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Research question', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Four-step route', { exact: true }).count(), 1);
  assert.equal(await page.getByText('Evidence path', { exact: true }).count(), 1);

  const selected = page.locator('[data-testid="weekly-topic-weekly-synthetic-calibration-orbit"]');
  const candidate = page.locator('[data-testid="weekly-topic-weekly-interface-stress-test"]');
  assert.equal(await selected.getAttribute('aria-pressed'), 'true');
  const transparency = await candidate.evaluate((element) => ({
    focus: Number.parseFloat(getComputedStyle(element.querySelector('[class*="titleFocus"]')).opacity),
    context: Number.parseFloat(getComputedStyle(element.querySelector('[class*="titleBefore"]')).opacity),
    phase: Number.parseFloat(getComputedStyle(element.querySelector('[class*="phase"]')).opacity),
  }));
  const selectedFocusOpacity = await selected.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element.querySelector('[class*="titleFocus"]')).opacity)
  );
  assert(
    selectedFocusOpacity > 0.95
      && transparency.focus >= 0.5
      && transparency.focus <= 0.75
      && transparency.context >= 0.75
      && transparency.phase > 0.95,
    'Topic transparency or small-text contrast is outside its intended range.'
  );
  const motion = await candidate.evaluate((element) => ({
    name: getComputedStyle(element).animationName,
    duration: Number.parseFloat(getComputedStyle(element).animationDuration),
  }));
  assert(motion.name !== 'none' && motion.duration >= 30, 'Slow topic motion is not active.');
  const motionToggle = page.getByTestId('weekly-motion-toggle');
  await motionToggle.click();
  assert.equal(await candidate.evaluate((element) => getComputedStyle(element).animationPlayState), 'paused');
  await motionToggle.click();
  assert.equal(await candidate.evaluate((element) => getComputedStyle(element).animationPlayState), 'running');
  const focusRatio = await selected.evaluate((element) => {
    const focus = element.querySelector('[class*="titleFocus"]');
    const title = element.querySelector('[class*="titleParts"]');
    return focus.getBoundingClientRect().height / title.getBoundingClientRect().height;
  });
  assert(focusRatio >= 0.6 && focusRatio <= 0.8, `Focus word ratio is ${focusRatio}.`);

  await candidate.focus();
  await candidate.press('Enter');
  assert.equal(await candidate.getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => document.activeElement?.id === 'weekly-selected-title');
  assert.equal(await page.locator('#weekly-selected-title').evaluate((element) => element === document.activeElement), true);
  await page.getByRole('heading', { name: 'Interface Stress Test', exact: true }).waitFor();
  await page.getByText('Which layout state fails first under long fictional copy?', { exact: true }).waitFor();
  assert.equal(await page.locator('#weekly-topic-detail ol > li').count(), 4);
  assert.equal(await page.locator('#weekly-topic-detail a[href^="/reading/#paper-"]').count(), 3);
  await page.screenshot({ path: path.join(screenshotDir, 'weekly-en-desktop.png'), fullPage: true });

  const languageToggle = page.locator('[data-testid="language-toggle"]:visible');
  await languageToggle.focus();
  await languageToggle.press('ArrowDown');
  await page.getByRole('menuitemradio').first().press('Escape');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'language-toggle');
  assert.equal(await languageToggle.evaluate((element) => element === document.activeElement), true, 'Escape did not restore language-toggle focus.');

  await setLocale(page, '简体中文');
  await page.getByRole('heading', { name: '课题宇宙', exact: true }).waitFor();
  await page.getByRole('heading', { name: '界面压力测试', exact: true }).waitFor();
  assert.equal(await candidate.getAttribute('aria-pressed'), 'true', 'Locale switch lost the selected topic.');
  await page.screenshot({ path: path.join(screenshotDir, 'weekly-zh-desktop.png'), fullPage: true });

  await setLocale(page, '繁體中文（香港）');
  await page.getByRole('heading', { name: '課題宇宙', exact: true }).waitFor();
  await page.getByRole('heading', { name: '介面壓力測試', exact: true }).waitFor();
  await page.screenshot({ path: path.join(screenshotDir, 'weekly-zh-hk-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await noHorizontalOverflow(page, 'Traditional Chinese weekly mobile');
  const topicBoxes = await page.locator('[data-testid^="weekly-topic-weekly-"]').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    })
  );
  assert(topicBoxes.every((box) => box.left >= -1 && box.right <= 391), 'A mobile topic is clipped horizontally.');
  for (let index = 1; index < topicBoxes.length; index += 1) {
    assert(topicBoxes[index].top >= topicBoxes[index - 1].bottom - 1, 'Mobile topic titles overlap.');
  }
  await page.screenshot({ path: path.join(screenshotDir, 'weekly-zh-hk-mobile.png'), fullPage: true });

  const storage = await page.evaluate(() => Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, key ? localStorage.getItem(key) : null];
    })
  ));
  assert.equal(JSON.stringify(storage).includes('Which layout state fails first'), false, 'Weekly content reached localStorage.');
  assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join(' | ')}`);
  assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join(' | ')}`);
  const publicAuthorization = await Promise.all(publicLibraryAuthorizationMarkers);
  assert(publicAuthorization.length > 0 && publicAuthorization.every((value) => value === 'absent'), 'Weekly credentials reached the public library endpoint.');
  await context.close();

  const reduced = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
    httpCredentials: { ...credentials, send: 'unauthorized' },
  });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${origin}/reading/weekly/`, { waitUntil: 'networkidle' });
  const reducedAnimation = await reducedPage.locator('[data-testid^="weekly-topic-weekly-"]').first()
    .evaluate((element) => getComputedStyle(element).animationName);
  assert.equal(reducedAnimation, 'none');
  await noHorizontalOverflow(reducedPage, 'Reduced-motion weekly page');
  await reduced.close();

  process.stdout.write(`Weekly browser checks passed (auth, three locales, selection, 70% focus, slow motion, reduced motion, and mobile); screenshots: ${screenshotDir}\n`);
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
}
