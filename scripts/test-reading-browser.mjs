import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  assertNoAuthorizationHeader,
  consumeRemoteBrowserEnvironment,
  resolveBrowserDataMode,
} from './reading-browser-security.mjs';

const remoteConfiguration = consumeRemoteBrowserEnvironment(process.env);
const configuredRemoteOrigin = remoteConfiguration.origin;
const remoteMode = configuredRemoteOrigin !== undefined;
const dataMode = resolveBrowserDataMode(remoteConfiguration.dataMode, remoteMode);
let origin = '';
let server;

if (remoteMode) {
  let parsedOrigin;
  try {
    parsedOrigin = new URL(configuredRemoteOrigin);
  } catch {
    throw new Error('READING_BROWSER_ORIGIN must be a valid HTTPS origin.');
  }

  assert(parsedOrigin.protocol === 'https:', 'READING_BROWSER_ORIGIN must use HTTPS.');
  assert(
    !parsedOrigin.username && !parsedOrigin.password,
    'READING_BROWSER_ORIGIN must not contain credentials.'
  );
  assert(
    parsedOrigin.pathname === '/' && !parsedOrigin.search && !parsedOrigin.hash,
    'READING_BROWSER_ORIGIN must not contain a path, query, or fragment.'
  );
  assert(
    configuredRemoteOrigin === parsedOrigin.origin || configuredRemoteOrigin === `${parsedOrigin.origin}/`,
    'READING_BROWSER_ORIGIN must be an HTTPS origin, with an optional trailing slash.'
  );

  origin = parsedOrigin.origin;
}

const screenshotDir = process.env.READING_QA_OUTPUT_DIR || path.join(os.tmpdir(), 'reading-browser-qa');
const chromeCandidates = [
  process.env.READING_CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

assert(executablePath, 'Chrome/Chromium was not found. Set READING_CHROME_PATH to its executable.');
if (!remoteMode) {
  assert(existsSync(path.join(process.cwd(), 'out/reading/index.html')), 'Run npm run build before browser checks.');
}
await mkdir(screenshotDir, { recursive: true });

let serverOutput = '';
let serverError = '';
if (!remoteMode) {
  server = spawn(process.execPath, ['scripts/serve-reading.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      READING_HOST: '127.0.0.1',
      READING_PORT: '0',
      READING_DATA_DIR: path.join(process.cwd(), 'tests/fixtures/reading'),
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
}

async function waitForServer() {
  if (!server) return;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Reading test server exited early. ${serverError}`);
    if (origin) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Reading test server did not become ready. ${serverError}`);
}

async function waitForText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible' });
}

async function expectFocused(locator, message) {
  assert(await locator.evaluate((element) => document.activeElement === element), message);
}

async function expectActiveTab(page, tab, message) {
  assert.equal(await tab.getAttribute('aria-selected'), 'true', `${message} was not selected.`);
  const tabId = await tab.getAttribute('id');
  await page.waitForFunction((id) => document.activeElement?.id === id, tabId);
  await expectFocused(tab, `${message} did not receive keyboard focus.`);
}

async function tabTo(page, target, maximumPresses = 12) {
  for (let presses = 0; presses < maximumPresses; presses += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }
  throw new Error(`Tab did not reach the requested target after ${maximumPresses} presses.`);
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.documentWidth <= dimensions.viewportWidth + 1,
    `${label} overflows horizontally (${dimensions.documentWidth}px > ${dimensions.viewportWidth}px).`
  );
}

async function assertGraphPainted(graph) {
  assert(await graph.evaluate((container) => [...container.querySelectorAll('canvas')].some((canvas) => {
    const drawing = canvas.getContext('2d');
    if (!drawing || canvas.width === 0 || canvas.height === 0) return false;
    const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) return true;
    return false;
  })), 'Cytoscape canvas contains no painted pixels.');
}

async function waitForReadingObservers(page, mounted, label) {
  try {
    await page.waitForFunction((expectMounted) => {
      const stats = window.__readingResizeObserverStats;
      return stats && (expectMounted ? stats.activeTargets > 0 : stats.activeTargets === 0);
    }, mounted);
  } catch (error) {
    const stats = await page.evaluate(() => window.__readingResizeObserverStats ?? null);
    throw new Error(`${label}; ResizeObserver stats: ${JSON.stringify(stats)}`, { cause: error });
  }
}

async function fetchThroughPage(page, pathname) {
  const targetUrl = new URL(pathname, page.url()).toString();
  const responsePromise = page.waitForResponse(
    (response) => response.url() === targetUrl && response.request().method() === 'GET' && response.status() === 200
  );
  const statusPromise = page.evaluate(async (pathToFetch) => {
    const response = await fetch(pathToFetch, { cache: 'no-store', credentials: 'same-origin' });
    await response.arrayBuffer();
    return response.status;
  }, pathname);
  const [response, status] = await Promise.all([responsePromise, statusPromise]);
  assert.equal(status, 200, `${pathname} was not readable through the browser page.`);
  return response.request().allHeaders();
}

async function runGenericSmoke(page) {
  const libraryTab = page.getByRole('tab', { name: 'Library' });
  const mapTab = page.getByRole('tab', { name: 'Map' });
  const threadsTab = page.getByRole('tab', { name: 'Threads' });
  const libraryRecords = page.locator('article[id^="reading-paper-"]');

  await page.locator('#reading-library-results').waitFor({ state: 'visible' });
  assert(await libraryRecords.count() > 0, 'Generic smoke found no Library records.');
  assert.equal(
    await page.getByRole('button', { name: '重试', exact: true }).count(),
    0,
    'Generic smoke loaded a Reading error state.'
  );
  await libraryRecords.first().getByRole('button', { name: 'Show details' }).click();
  await waitForText(page, 'Why this record is retained');

  await mapTab.click();
  const graph = page.locator('[data-testid="reading-graph-canvas"]');
  await graph.locator('canvas').first().waitFor();
  await assertGraphPainted(graph);
  const graphPapers = page.locator('#map-keyboard-fallback').getByRole('button');
  assert(await graphPapers.count() > 0, 'Generic smoke found no keyboard-accessible Map papers.');
  await graphPapers.first().click();
  await page.locator('#selected-paper-heading').waitFor({ state: 'visible' });

  await threadsTab.click();
  await page.locator('#reading-threads-heading').waitFor({ state: 'visible' });
  assert(
    await page.locator('article[data-thread-id]').count() > 0,
    'Generic smoke found no Threads records.'
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await libraryTab.click();
  await page.locator('#reading-library-results').waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(page, 'Generic mobile Library');
  await mapTab.click();
  await graph.locator('canvas').first().waitFor();
  await assertNoHorizontalOverflow(page, 'Generic mobile Map');
  await threadsTab.click();
  await page.locator('#reading-threads-heading').waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(page, 'Generic mobile Threads');
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function assertAnonymousPublicPages(browser, origin) {
  const publicContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const publicPage = await publicContext.newPage();
  const publicPageErrors = [];
  publicPage.on('pageerror', (error) => publicPageErrors.push(error.message));
  try {
    for (const [pathname, expectedText] of [
      ['/', 'Kang-Kang Shao'],
      ['/publications/', 'Publications'],
      ['/learning/', 'Theory Notes'],
    ]) {
      const response = await publicPage.goto(`${origin}${pathname}`, { waitUntil: 'domcontentloaded' });
      assert.equal(response?.status(), 200, `Anonymous ${pathname} did not remain public.`);
      assertNoAuthorizationHeader(response?.request().headers() ?? {}, `Anonymous ${pathname}`);
      await waitForText(publicPage, expectedText);
      assert.equal(await publicPage.locator('nav a').filter({ hasText: /^Reading$/ }).count(), 1);
    }

    const navigationCases = [
      { locale: 'en', reading: 'Reading', menu: 'Open main menu' },
      { locale: 'zh', reading: '阅读', menu: '打开主菜单' },
      { locale: 'zh-hk', reading: '閱讀', menu: '開啟主選單' },
    ];
    for (const width of [1279, 1280]) {
      await publicPage.setViewportSize({ width, height: 900 });
      for (const navigationCase of navigationCases) {
        await publicPage.evaluate((locale) => localStorage.setItem('locale-storage', locale), navigationCase.locale);
        await publicPage.goto(`${origin}/`, { waitUntil: 'networkidle' });
        await publicPage.waitForFunction(
          (locale) => document.documentElement.getAttribute('data-locale') === locale,
          navigationCase.locale
        );

        const navigation = publicPage.locator('nav').first();
        if (width < 1280) {
          await navigation.getByRole('button', { name: navigationCase.menu, exact: true }).click();
        } else {
          assert.equal(
            await navigation.getByRole('button', { name: navigationCase.menu, exact: true }).count(),
            0,
            `${navigationCase.locale} unexpectedly retained the compact menu at ${width}px.`
          );
        }

        const readingLink = navigation.getByRole('link', { name: navigationCase.reading, exact: true });
        await readingLink.waitFor({ state: 'visible' });
        assert.equal(
          await readingLink.count(),
          1,
          `${navigationCase.locale} must expose exactly one visible Reading entry at ${width}px.`
        );
        await assertNoHorizontalOverflow(publicPage, `${navigationCase.locale} navigation at ${width}px`);
      }
    }
    assert.deepEqual(publicPageErrors, [], `Anonymous public-page errors: ${publicPageErrors.join(' | ')}`);
  } finally {
    await publicContext.close();
  }
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    const NativeResizeObserver = window.ResizeObserver;
    if (!NativeResizeObserver) return;

    const stats = {
      readingObservers: 0,
      observeCalls: 0,
      disconnectCalls: 0,
      activeTargets: 0,
    };
    Object.defineProperty(window, '__readingResizeObserverStats', { value: stats });

    class InstrumentedResizeObserver {
      constructor(callback) {
        this.readingTargets = new Set();
        this.observedReading = false;
        this.disconnectedReading = false;
        this.delegate = new NativeResizeObserver((entries) => callback(entries, this));
      }

      observe(target, options) {
        if (target instanceof Element && target.matches('[data-testid="reading-graph-canvas"]')) {
          if (!this.observedReading) {
            this.observedReading = true;
            stats.readingObservers += 1;
          }
          if (!this.readingTargets.has(target)) {
            this.readingTargets.add(target);
            stats.observeCalls += 1;
            stats.activeTargets += 1;
          }
        }
        return this.delegate.observe(target, options);
      }

      unobserve(target) {
        if (this.readingTargets.delete(target)) stats.activeTargets -= 1;
        return this.delegate.unobserve(target);
      }

      disconnect() {
        if (this.observedReading && !this.disconnectedReading) {
          this.disconnectedReading = true;
          stats.disconnectCalls += 1;
        }
        stats.activeTargets -= this.readingTargets.size;
        this.readingTargets.clear();
        return this.delegate.disconnect();
      }

      takeRecords() {
        return this.delegate.takeRecords();
      }
    }

    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: InstrumentedResizeObserver,
    });
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const readingResponse = await page.goto(`${origin}/reading`, { waitUntil: 'networkidle' });
  assert.equal(readingResponse?.status(), 200, 'The public Reading navigation did not finish successfully.');
  assert.equal(new URL(page.url()).pathname, '/reading/', 'The canonical Reading URL did not retain its trailing slash.');
  const readingDataHeaders = await fetchThroughPage(page, '/reading/data/library.json?public-access-check=1');
  assertNoAuthorizationHeader(readingDataHeaders, 'Public Reading data request');
  for (const publicPath of [
    '/?protection-space-check=1',
    '/favicon.svg?protection-space-check=1',
    '/search-index.json?protection-space-check=1',
  ]) {
    const publicHeaders = await fetchThroughPage(page, publicPath);
    assertNoAuthorizationHeader(publicHeaders, `Public path ${publicPath.split('?')[0]}`);
  }
  assert.equal(await page.getByRole('tab').count(), 3, 'Reading must expose three tabs.');

  if (dataMode === 'generic') {
    await runGenericSmoke(page);
  } else {
    await waitForText(page, 'Showing 4 of 4');
    await page.locator('#reading-library-search').fill('synthetic measurement');
    await waitForText(page, 'Showing 1 of 4');
    assert.equal(await page.locator('article[id^="reading-paper-"]').count(), 1);
    await page.locator('section[aria-label="Library search and filters"]').getByRole('button', { name: 'Reset' }).click();
    await waitForText(page, 'Showing 4 of 4');

    await page.locator('#reading-library-search').fill('1234567');
    await waitForText(page, 'Showing 1 of 4');
    await waitForText(page, 'Synthetic Measurement Inputs for Interface Testing');
    await page.locator('section[aria-label="Library search and filters"]').getByRole('button', { name: 'Reset' }).click();
    await waitForText(page, 'Showing 4 of 4');

    await page.locator('#reading-library-search').fill('intentionally not a real bibliographic record');
    await waitForText(page, 'Showing 1 of 4');
    await waitForText(page, 'A Synthetic Primer for Structured Reading');
    await page.locator('section[aria-label="Library search and filters"]').getByRole('button', { name: 'Reset' }).click();
    await waitForText(page, 'Showing 4 of 4');

    await page.locator('#reading-library-search').fill('no synthetic record matches this phrase');
    await waitForText(page, 'No records match these controls');
    assert.equal(await page.locator('article[id^="reading-paper-"]').count(), 0);
    await page.getByRole('button', { name: 'Clear search and filters' }).click();
    await waitForText(page, 'Showing 4 of 4');

    const filters = [
      ['#reading-filter-topic', 'calibration'],
      ['#reading-filter-process', 'example-process-b'],
      ['#reading-filter-role', 'experiment'],
      ['#reading-filter-year', '2023'],
      ['#reading-filter-priority', '5'],
      ['#reading-filter-origin', 'external_supplement'],
    ];
    for (const [selector, value] of filters) await page.locator(selector).selectOption(value);
    await waitForText(page, 'Showing 1 of 4');
    await waitForText(page, 'Synthetic Measurement Inputs for Interface Testing');
    await page.locator('section[aria-label="Library search and filters"]').getByRole('button', { name: 'Reset' }).click();

    const primer = page.locator('#reading-paper-syntheticPrimer');
    await primer.getByRole('button', { name: 'Show details' }).click();
    await waitForText(page, 'Why this record is retained');
    assert.equal(await page.evaluate(() => window.__readingInjected), undefined, 'Fixture markup executed as script.');
    assert.match(await primer.textContent(), /<script>window\.__readingInjected = true<\/script>/);
    await page.screenshot({ path: path.join(screenshotDir, 'library-desktop.png'), fullPage: false });

    const libraryTab = page.getByRole('tab', { name: 'Library' });
    const mapTab = page.getByRole('tab', { name: 'Map' });
    const threadsTab = page.getByRole('tab', { name: 'Threads' });
    const graph = page.locator('[data-testid="reading-graph-canvas"]');

    await libraryTab.focus();
    await page.keyboard.press('ArrowRight');
    await expectActiveTab(page, mapTab, 'Map tab after ArrowRight');
    await graph.locator('canvas').first().waitFor();
    await waitForReadingObservers(page, true, 'Initial Map mount was not observed');
    await page.keyboard.press('ArrowLeft');
    await expectActiveTab(page, libraryTab, 'Library tab after ArrowLeft');
    await waitForReadingObservers(page, false, 'Initial Map unmount retained an observer');
    await page.keyboard.press('End');
    await expectActiveTab(page, threadsTab, 'Threads tab after End');
    await page.keyboard.press('Home');
    await expectActiveTab(page, libraryTab, 'Library tab after Home');
    await page.keyboard.press('ArrowRight');
    await expectActiveTab(page, mapTab, 'Map tab after the final ArrowRight');
    await graph.locator('canvas').first().waitFor();
    await waitForReadingObservers(page, true, 'Second Map mount was not observed');
    assert.equal(await graph.getAttribute('data-anchor-label-limit'), '5', 'Desktop Map must use the restrained five-label profile.');
    const desktopGraphHeight = await graph.evaluate((element) => element.getBoundingClientRect().height);
    assert(
      desktopGraphHeight >= 560 && desktopGraphHeight <= 620,
      `Desktop Map canvas height is outside the compact target (${desktopGraphHeight}px).`
    );

    await waitForText(page, '2 篇文献 · 1 条当前连线');
    const canvasCount = await graph.locator('canvas').count();
    assert(canvasCount > 0, 'Cytoscape did not create canvas layers.');
    await assertGraphPainted(graph);

    const graphList = page.locator('#map-keyboard-fallback');
    const primerGraphButton = graphList.getByRole('button', { name: /A Synthetic Primer/ });
    const fitButton = page.getByRole('button', { name: '适配图谱视图' });
    const relayoutButton = page.getByRole('button', { name: '重新计算图谱布局' });
    await fitButton.focus();
    await page.keyboard.press('Enter');
    await relayoutButton.focus();
    await page.keyboard.press('Enter');
    await tabTo(page, primerGraphButton, 3);
    await page.keyboard.press('Enter');
    await waitForText(page, '邻接文献（键盘列表）');

    const twoHopButton = page.getByRole('button', { name: '展开 2 跳', exact: true });
    await twoHopButton.focus();
    await page.keyboard.press('Enter');
    await waitForText(page, '3 篇文献 · 2 条当前连线');

    const resetMap = async () => {
      await page.getByRole('button', { name: '重置', exact: true }).click();
      await waitForText(page, '2 篇文献 · 1 条当前连线');
      await graph.locator('canvas').first().waitFor();
    };
    await resetMap();

    const methodGraphButton = graphList.getByRole('button', { name: /A Deliberately Invented Method/ });
    await methodGraphButton.focus();
    await page.keyboard.press('Enter');
    const defaultHopButton = page.getByRole('button', { name: '按默认展开 1 跳', exact: true });
    await defaultHopButton.focus();
    await page.keyboard.press('Enter');
    await waitForText(page, '3 篇文献 · 2 条当前连线');
    await resetMap();

    const mapSearch = page.locator('#map-search');
    await mapSearch.fill('Synthetic Measurement Inputs');
    await mapSearch.press('Enter');
    await waitForText(page, '已定位：Synthetic Measurement Inputs for Interface Testing');
    assert.equal(await page.locator('#selected-paper-heading').textContent(), 'Synthetic Measurement Inputs for Interface Testing');
    await waitForText(page, '3 篇文献 · 2 条当前连线');
    await resetMap();

    const mapControls = page.locator('section[aria-labelledby="map-controls-heading"]');
    const mapFilterCases = [
      ['主题', 'calibration', '2 篇文献 · 1 条当前连线'],
      ['过程', 'example-process-b', '2 篇文献 · 1 条当前连线'],
      ['角色', 'experiment', '1 篇文献 · 0 条当前连线'],
      ['年份', '2021', '1 篇文献 · 0 条当前连线'],
      ['关系', 'uses_data_from', '3 篇文献 · 1 条当前连线'],
    ];
    for (const [label, value, expectedCount] of mapFilterCases) {
      await page.getByRole('button', { name: '显示全部筛选结果', exact: true }).click();
      await mapControls.getByRole('combobox', { name: label, exact: true }).selectOption(value);
      await waitForText(page, expectedCount);
      await resetMap();
    }

    await mapControls.getByRole('combobox', { name: '角色', exact: true }).selectOption('review');
    await waitForText(page, '当前筛选没有可显示的文献');
    await resetMap();

    await page.getByRole('button', { name: /显示全部筛选结果/ }).click();
    await waitForText(page, '3 篇文献 · 2 条当前连线');
    const measurementGraphButton = graphList.getByRole('button', { name: /Synthetic Measurement Inputs/ });
    await measurementGraphButton.focus();
    await page.keyboard.press('Enter');
    await waitForText(page, '选中文献');
    await page.getByRole('button', { name: /回到当前展开/ }).click();
    await waitForText(page, '2 篇文献 · 1 条当前连线');
    assert.equal(await page.getByText('选中文献', { exact: true }).count(), 0, 'Hidden Map selection was retained.');

    await primerGraphButton.focus();
    await page.keyboard.press('Enter');
    await waitForText(page, '邻接文献（键盘列表）');
    await page.getByRole('checkbox', { name: '建议阅读连接' }).check();
    const undirectedItem = page.locator('section[aria-labelledby="adjacent-heading"] li').filter({
      hasText: '无向 · 建议阅读连接',
    });
    await undirectedItem.first().waitFor();
    const edgeButton = undirectedItem.getByRole('button', { name: /查看.*关系/ });
    await undirectedItem.getByRole('button').first().focus();
    await page.keyboard.press('Tab');
    await expectFocused(edgeButton, 'Tab did not move from the adjacent paper to its relation button.');
    await page.keyboard.press('Enter');
    const edgeDetail = page.locator('#selected-edge-detail');
    await edgeDetail.waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'selected-edge-detail');
    assert.match(await edgeDetail.textContent(), /方向无向/);
    assert.match(await edgeDetail.textContent(), /置信标记策展建议/);
    assert.match(await edgeDetail.textContent(), /状态建议/);
    await page.screenshot({ path: path.join(screenshotDir, 'map-desktop.png'), fullPage: false });

    const lifecycleStart = await page.evaluate(() => ({ ...window.__readingResizeObserverStats }));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await mapTab.focus();
      await page.keyboard.press('ArrowRight');
      await expectActiveTab(page, threadsTab, `Threads tab during lifecycle cycle ${cycle + 1}`);
      await waitForReadingObservers(page, false, `Map lifecycle cycle ${cycle + 1} retained an observer`);
      const unmounted = await page.evaluate(() => ({ ...window.__readingResizeObserverStats }));
      assert(
        unmounted.disconnectCalls >= lifecycleStart.disconnectCalls + cycle + 1,
        `Map lifecycle cycle ${cycle + 1} did not disconnect its ResizeObserver.`
      );

      await page.keyboard.press('ArrowLeft');
      await expectActiveTab(page, mapTab, `Map tab during lifecycle cycle ${cycle + 1}`);
      await graph.locator('canvas').first().waitFor();
      await waitForReadingObservers(page, true, `Map lifecycle cycle ${cycle + 1} was not observed after remount`);
      assert.equal(await graph.locator('canvas').count(), canvasCount, `Map lifecycle cycle ${cycle + 1} accumulated canvas layers.`);
    }
    const lifecycleEnd = await page.evaluate(() => ({ ...window.__readingResizeObserverStats }));
    assert(lifecycleEnd.readingObservers >= lifecycleStart.readingObservers + 3, 'Map was not remounted three times.');
    assert(lifecycleEnd.disconnectCalls >= lifecycleStart.disconnectCalls + 3, 'Map did not clean up three observer instances.');
    assert(lifecycleEnd.activeTargets > 0, `Mounted Map has no active graph observer; stats: ${JSON.stringify(lifecycleEnd)}`);

    await mapTab.focus();
    await page.keyboard.press('ArrowRight');
    await expectActiveTab(page, threadsTab, 'Threads tab before keyboard thread navigation');
    await waitForReadingObservers(page, false, 'Map observer remained active after switching to Threads');
    assert.equal(await page.locator('article[data-thread-id]').count(), 2);
    await waitForText(page, 'No literature is linked to this diagnostic stage');
    const threadPaper = page.getByRole('button', { name: /Open paper A Synthetic Primer/ }).first();
    await tabTo(page, threadPaper, 4);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'reading-paper-title-syntheticPrimer');
    await waitForText(page, 'Why this record is retained');

    const themeButton = page.locator('button[title*="theme" i]').first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await page.evaluate(() => document.documentElement.classList.contains('dark'))) break;
      await themeButton.click();
    }
    assert(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'Dark theme was not activated.');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(screenshotDir, 'library-dark.png'), fullPage: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await assertNoHorizontalOverflow(page, 'Mobile Library');
    assert.equal(await page.getByRole('tab').count(), 3);
    await page.screenshot({ path: path.join(screenshotDir, 'library-mobile.png'), fullPage: false });

    await mapTab.click();
    await graph.locator('canvas').first().waitFor();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="reading-graph-canvas"]')?.getAttribute('data-anchor-label-limit') === '3'
    );
    const mobileGraphHeight = await graph.evaluate((element) => element.getBoundingClientRect().height);
    assert(
      mobileGraphHeight >= 420 && mobileGraphHeight <= 470,
      `Mobile Map canvas height is outside the compact target (${mobileGraphHeight}px).`
    );
    await assertNoHorizontalOverflow(page, 'Mobile Map');
    await graph.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(screenshotDir, 'map-mobile.png'), fullPage: false });

    await threadsTab.click();
    await waitForText(page, 'No literature is linked to this diagnostic stage');
    assert.equal(await page.locator('article[data-thread-id]').count(), 2);
    await assertNoHorizontalOverflow(page, 'Mobile Threads');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(screenshotDir, 'threads-mobile.png'), fullPage: false });
    await page.setViewportSize({ width: 1440, height: 1000 });

    const touchContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'light',
      reducedMotion: 'reduce',
      hasTouch: true,
      isMobile: true,
    });
    const touchPage = await touchContext.newPage();
    try {
      const touchResponse = await touchPage.goto(`${origin}/reading`, { waitUntil: 'networkidle' });
      assert.equal(touchResponse?.status(), 200, 'The touch Reading navigation did not finish successfully.');
      await waitForText(touchPage, 'Showing 4 of 4');
      await touchPage.getByRole('tab', { name: 'Map' }).click();
      const touchGraph = touchPage.locator('[data-testid="reading-graph-canvas"]');
      await touchGraph.locator('canvas').first().waitFor();
      assert.match(
        await touchGraph.evaluate((element) => getComputedStyle(element).touchAction),
        /\bpan-y\b/,
        'The touch graph does not allow vertical page panning.'
      );

      await touchGraph.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      const graphBounds = await touchGraph.boundingBox();
      assert(graphBounds, 'The touch graph has no visible bounds.');
      const scrollBefore = await touchPage.evaluate(() => window.scrollY);
      const availableScroll = await touchPage.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight - window.scrollY
      );
      assert(availableScroll > 120, 'The touch graph page has insufficient room to test vertical scrolling.');

      const touchSession = await touchContext.newCDPSession(touchPage);
      const touchX = Math.round(graphBounds.x + graphBounds.width / 2);
      const touchStartY = Math.round(graphBounds.y + graphBounds.height / 2);
      await touchSession.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: touchX, y: touchStartY }],
      });
      for (let step = 1; step <= 6; step += 1) {
        await touchSession.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: touchX, y: touchStartY - step * 30 }],
        });
        await touchPage.waitForTimeout(16);
      }
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touchPage.waitForTimeout(150);
      const scrollAfter = await touchPage.evaluate(() => window.scrollY);
      assert(
        scrollAfter > scrollBefore + 60,
        `A vertical swipe over the touch graph did not scroll the page (${scrollBefore}px to ${scrollAfter}px).`
      );
    } finally {
      await touchContext.close();
    }

    const dataPattern = '**/reading/data/library.json';
    let releaseLoading;
    const loadingGate = new Promise((resolve) => { releaseLoading = resolve; });
    const loadingHandler = async (route) => {
      await loadingGate;
      await route.continue();
    };
    await page.route(dataPattern, loadingHandler);
    const loadingReload = page.reload({ waitUntil: 'networkidle' });
    await waitForText(page, '正在读取 Reading 数据');
    releaseLoading();
    await loadingReload;
    await page.unroute(dataPattern, loadingHandler);

    const failureCases = [
      [401, '{"error":"unavailable"}', 'Reading 数据暂不可用'],
      [403, '{"error":"unavailable"}', 'Reading 数据暂不可用'],
      [200, 'not valid JSON', '数据格式不符合 Reading v1 契约'],
      [200, '{"malformed":true}', '数据格式不符合 Reading v1 契约'],
      [503, '{"error":"unavailable"}', 'Reading 数据暂不可用'],
    ];
    for (const [status, body, expected] of failureCases) {
      const handler = (route) => route.fulfill({ status, contentType: 'application/json', body });
      await page.route(dataPattern, handler);
      await page.reload({ waitUntil: 'networkidle' });
      await waitForText(page, expected);
      await page.unroute(dataPattern, handler);
    }
    await page.getByRole('button', { name: '重试' }).click();
    await waitForText(page, 'Showing 4 of 4');
  }

  await assertAnonymousPublicPages(browser, origin);
  assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join(' | ')}`);
  process.stdout.write(
    dataMode === 'synthetic'
      ? `Reading browser checks passed; synthetic screenshots: ${screenshotDir}\n`
      : 'Reading generic browser smoke passed without fixture-specific assertions.\n'
  );
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
}
