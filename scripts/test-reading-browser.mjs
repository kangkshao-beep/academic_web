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

async function assertFullyVisibleInViewport(locator, label) {
  const bounds = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  assert(
    bounds.left >= -1
      && bounds.right <= bounds.viewportWidth + 1
      && bounds.top >= -1
      && bounds.bottom <= bounds.viewportHeight + 1,
    `${label} is clipped outside the viewport.`
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
    await page.getByRole('button', { name: 'Retry', exact: true }).count(),
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
  const weeklyEntry = page.locator('a[href="/reading/weekly/"]');
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertFullyVisibleInViewport(weeklyEntry, 'Generic mobile Weekly entry');
  assert.equal((await weeklyEntry.innerText()).trim(), 'Weekly topics');
  await assertNoHorizontalOverflow(page, 'Generic mobile Library');
  await mapTab.click();
  await graph.locator('canvas').first().waitFor();
  await assertNoHorizontalOverflow(page, 'Generic mobile Map');
  await threadsTab.click();
  await page.locator('#reading-threads-heading').waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(page, 'Generic mobile Threads');
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function switchLocale(page, optionName, expectedLocale) {
  const toggle = page.locator('button[aria-haspopup="menu"]').first();
  await toggle.click();
  await page.getByRole('menuitemradio', { name: optionName, exact: true }).click();
  await page.waitForFunction(
    (locale) => document.documentElement.getAttribute('data-locale') === locale,
    expectedLocale
  );
}

async function assertReadingLocales(page) {
  const cases = [
    {
      locale: 'en', option: 'English EN', title: 'Reading',
      description: 'A research reading index, relationship map, and thematic paths for inclusive heavy-flavor semileptonic decays.',
      tabs: ['Library', 'Map', 'Threads'], records: 'Library records',
      placeholder: 'Search titles, authors, identifiers, topics, processes, or annotations',
      mapHeading: 'Literature relationship map', threadsHeading: 'Threads',
      entryType: 'Article', role: 'Foundation', status: 'Unknown (not marked as read)',
      forbidden: ['文献记录', '文獻記錄'],
    },
    {
      locale: 'zh', option: '简体中文 ZH', title: '阅读',
      description: '关于重味强子半轻子单举衰变的研究阅读索引、文献关系图与主题路径。',
      tabs: ['文献库', '关系图', '主题线索'], records: '文献记录',
      placeholder: '搜索题名、作者、标识符、主题、过程或批注',
      mapHeading: '文献关系图', threadsHeading: '主题线索',
      entryType: '期刊论文', role: '基础', status: '未知（未标记为已读）',
      forbidden: ['文獻記錄', '關係圖', '閱讀狀態'],
    },
    {
      locale: 'zh-hk', option: '繁體中文（香港） ZH-HK', title: '閱讀',
      description: '重味強子半輕子單舉衰變研究的文獻索引、關係圖與閱讀脈絡。',
      tabs: ['文獻庫', '關係圖', '閱讀脈絡'], records: '文獻記錄',
      placeholder: '搜尋題名、作者、識別碼、主題、過程或批註',
      mapHeading: '文獻關係圖', threadsHeading: '閱讀脈絡',
      entryType: '期刊論文', role: '基礎', status: '未知（未標記為已讀）',
      forbidden: ['文献记录', '关系图', '阅读状态', '筛选', '证据层'],
    },
  ];

  for (const localeCase of cases) {
    await switchLocale(page, localeCase.option, localeCase.locale);
    const reading = page.getByTestId('reading-app');
    await reading.getByRole('heading', { name: localeCase.title, level: 1, exact: true }).waitFor();
    await waitForText(reading, localeCase.description);

    for (const tabName of localeCase.tabs) {
      assert.equal(await reading.getByRole('tab', { name: tabName, exact: true }).count(), 1);
    }

    const libraryTab = reading.getByRole('tab', { name: localeCase.tabs[0], exact: true });
    await libraryTab.click();
    await reading.getByRole('heading', { name: localeCase.records, exact: true }).waitFor();
    assert.equal(
      await reading.locator('#reading-library-search').getAttribute('placeholder'),
      localeCase.placeholder
    );
    const firstPaper = reading.locator('article[id^="reading-paper-"]').first();
    const firstPaperText = await firstPaper.innerText();
    assert(firstPaperText.includes(localeCase.entryType), `${localeCase.locale} entry type was not localized.`);
    assert(firstPaperText.includes(localeCase.role), `${localeCase.locale} role was not localized.`);
    assert(firstPaperText.includes(localeCase.status), `${localeCase.locale} reading status was not localized.`);

    await reading.getByRole('tab', { name: localeCase.tabs[1], exact: true }).click();
    await reading.getByRole('heading', { name: localeCase.mapHeading, exact: true }).waitFor();
    await reading.getByRole('tab', { name: localeCase.tabs[2], exact: true }).click();
    await reading.getByRole('heading', { name: localeCase.threadsHeading, exact: true }).waitFor();

    const readingText = await reading.innerText();
    for (const forbidden of localeCase.forbidden) {
      assert(!readingText.includes(forbidden), `${localeCase.locale} Reading UI contains stale text: ${forbidden}`);
    }
  }

  await switchLocale(page, 'English EN', 'en');
  const reading = page.getByTestId('reading-app');
  await reading.getByRole('tab', { name: 'Map', exact: true }).click();
  const mapPaperTitle = (await reading.locator('#map-keyboard-fallback button span').first().textContent())?.trim();
  assert(mapPaperTitle, 'Map did not expose a paper title for the localized search-status check.');
  const mapSearch = reading.locator('#map-search');
  await mapSearch.fill(mapPaperTitle);
  await mapSearch.press('Enter');
  await waitForText(reading, `Located: ${mapPaperTitle}`);
  await switchLocale(page, '简体中文 ZH', 'zh');
  await waitForText(reading, `已定位：${mapPaperTitle}`);
  assert.equal(await reading.getByText('Located:', { exact: false }).count(), 0, 'Map search status retained English after switching to zh.');
  await switchLocale(page, '繁體中文（香港） ZH-HK', 'zh-hk');
  await waitForText(reading, `已定位：${mapPaperTitle}`);

  await switchLocale(page, 'English EN', 'en');
  await reading.getByRole('tab', { name: 'Library', exact: true }).click();
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
    try {
      if (localStorage.getItem('locale-storage') === null) localStorage.setItem('locale-storage', 'en');
    } catch {
      // The origin may not expose storage during the initial blank document.
    }
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
    await assertReadingLocales(page);
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

    await waitForText(page, '2 papers · 1 current relation');
    const canvasCount = await graph.locator('canvas').count();
    assert(canvasCount > 0, 'Cytoscape did not create canvas layers.');
    await assertGraphPainted(graph);

    const graphList = page.locator('#map-keyboard-fallback');
    const primerGraphButton = graphList.getByRole('button', { name: /A Synthetic Primer/ });
    const fitButton = page.getByRole('button', { name: 'Fit graph view' });
    const relayoutButton = page.getByRole('button', { name: 'Recalculate graph layout' });
    await fitButton.focus();
    await page.keyboard.press('Enter');
    await relayoutButton.focus();
    await page.keyboard.press('Enter');
    await tabTo(page, primerGraphButton, 3);
    await page.keyboard.press('Enter');
    await waitForText(page, 'Adjacent papers (keyboard list)');

    const twoHopButton = page.getByRole('button', { name: 'Expand 2 hops', exact: true });
    await twoHopButton.focus();
    await page.keyboard.press('Enter');
    await waitForText(page, '3 papers · 2 current relations');

    const resetMap = async () => {
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await waitForText(page, '2 papers · 1 current relation');
      await graph.locator('canvas').first().waitFor();
    };
    await resetMap();

    const methodGraphButton = graphList.getByRole('button', { name: /A Deliberately Invented Method/ });
    await methodGraphButton.focus();
    await page.keyboard.press('Enter');
    const defaultHopButton = page.getByRole('button', { name: 'Expand default 1 hop', exact: true });
    await defaultHopButton.focus();
    await page.keyboard.press('Enter');
    await waitForText(page, '3 papers · 2 current relations');
    await resetMap();

    const mapSearch = page.locator('#map-search');
    await mapSearch.fill('Synthetic Measurement Inputs');
    await mapSearch.press('Enter');
    await waitForText(page, 'Located: Synthetic Measurement Inputs for Interface Testing');
    assert.equal(await page.locator('#selected-paper-heading').textContent(), 'Synthetic Measurement Inputs for Interface Testing');
    await waitForText(page, '3 papers · 2 current relations');
    await resetMap();

    const mapControls = page.locator('section[aria-labelledby="map-controls-heading"]');
    const mapFilterCases = [
      ['Topic', 'calibration', '2 papers · 1 current relation'],
      ['Process', 'example-process-b', '2 papers · 1 current relation'],
      ['Role', 'experiment', '1 paper · 0 current relations'],
      ['Year', '2021', '1 paper · 0 current relations'],
      ['Relation', 'uses_data_from', '3 papers · 1 current relation'],
    ];
    for (const [label, value, expectedCount] of mapFilterCases) {
      await page.getByRole('button', { name: 'Show all filtered results', exact: true }).click();
      await mapControls.getByRole('combobox', { name: label, exact: true }).selectOption(value);
      await waitForText(page, expectedCount);
      await resetMap();
    }

    await mapControls.getByRole('combobox', { name: 'Role', exact: true }).selectOption('review');
    await waitForText(page, 'No papers match the current filters');
    await resetMap();

    await page.getByRole('button', { name: /Show all filtered results/ }).click();
    await waitForText(page, '3 papers · 2 current relations');
    const measurementGraphButton = graphList.getByRole('button', { name: /Synthetic Measurement Inputs/ });
    await measurementGraphButton.focus();
    await page.keyboard.press('Enter');
    await waitForText(page, 'Selected paper');
    await page.getByRole('button', { name: /Return to current expansion/ }).click();
    await waitForText(page, '2 papers · 1 current relation');
    assert.equal(await page.getByText('Selected paper', { exact: true }).count(), 0, 'Hidden Map selection was retained.');

    await primerGraphButton.focus();
    await page.keyboard.press('Enter');
    await waitForText(page, 'Adjacent papers (keyboard list)');
    await page.getByRole('checkbox', { name: 'Suggested reading link' }).check();
    const undirectedItem = page.locator('section[aria-labelledby="adjacent-heading"] li').filter({
      hasText: 'undirected · Suggested reading link',
    });
    await undirectedItem.first().waitFor();
    const edgeButton = undirectedItem.getByRole('button', { name: /View the .* relation/ });
    await undirectedItem.getByRole('button').first().focus();
    await page.keyboard.press('Tab');
    await expectFocused(edgeButton, 'Tab did not move from the adjacent paper to its relation button.');
    await page.keyboard.press('Enter');
    const edgeDetail = page.locator('#selected-edge-detail');
    await edgeDetail.waitFor();
    await page.waitForFunction(() => document.activeElement?.id === 'selected-edge-detail');
    assert.match(await edgeDetail.textContent(), /Directionundirected/);
    assert.match(await edgeDetail.textContent(), /Confidence markerCuratorial suggestion/);
    assert.match(await edgeDetail.textContent(), /Statusproposed/);
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
    await touchContext.addInitScript(() => localStorage.setItem('locale-storage', 'en'));
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
    await waitForText(page, 'Loading Reading data');
    releaseLoading();
    await loadingReload;
    await page.unroute(dataPattern, loadingHandler);

    const failureCases = [
      [401, '{"error":"unavailable"}', 'Reading data is temporarily unavailable'],
      [403, '{"error":"unavailable"}', 'Reading data is temporarily unavailable'],
      [200, 'not valid JSON', 'Data does not match the Reading v1 contract'],
      [200, '{"malformed":true}', 'Data does not match the Reading v1 contract'],
      [503, '{"error":"unavailable"}', 'Reading data is temporarily unavailable'],
    ];
    for (const [status, body, expected] of failureCases) {
      const handler = (route) => route.fulfill({ status, contentType: 'application/json', body });
      await page.route(dataPattern, handler);
      await page.reload({ waitUntil: 'networkidle' });
      await waitForText(page, expected);
      await page.unroute(dataPattern, handler);
    }
    await page.getByRole('button', { name: 'Retry' }).click();
    await waitForText(page, 'Showing 4 of 4');
    await assertReadingLocales(page);
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
