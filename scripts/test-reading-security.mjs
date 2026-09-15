import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { projectReadingPublicFile } from '../functions/reading/_public-data.mjs';

const canary = 'SYNTHETIC_READING_CANARY_74f9b2c1';
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'reading-security-'));
const fixtureDir = path.join(process.cwd(), 'tests/fixtures/reading');
const filenames = ['library.json', 'relations.json', 'threads.json', 'view_config.json'];
const pageCache = 'public, max-age=0, must-revalidate';
const dataCache = 'public, max-age=60, s-maxage=300, stale-while-revalidate=60';
const expectedPublicData = new Map();

await Promise.all(filenames.map(async (filename) => {
  const value = JSON.parse(await readFile(path.join(fixtureDir, filename), 'utf8'));
  if (filename === 'library.json') value.papers[0].personal_notes = canary;
  const projected = projectReadingPublicFile(filename, value, 'private');
  expectedPublicData.set(filename, projected);
  await writeFile(path.join(dataDir, filename), JSON.stringify(value), { mode: 0o600 });
}));

const child = spawn(process.execPath, ['scripts/serve-reading.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    READING_HOST: '127.0.0.1',
    READING_DATA_DIR: dataDir,
    READING_PORT: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverError = '';
let serverOutput = '';
let origin = '';
child.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
  const match = /Reading test server listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(serverOutput);
  if (match) origin = match[1];
});
child.stderr.on('data', (chunk) => {
  serverError += chunk.toString();
});

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Local Reading server exited before becoming ready. ${serverError}`);
    }
    try {
      if (origin) {
        const response = await fetch(`${origin}/`, { redirect: 'manual' });
        if (response.status > 0) return;
      }
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local Reading server did not start. ${serverError}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSecurityHeaders(response, pathname, cacheControl) {
  assert(response.headers.get('cache-control') === cacheControl, `${pathname} has the wrong cache policy.`);
  assert(!response.headers.has('x-robots-tag'), `${pathname} unexpectedly opts out of indexing.`);
  assert(!response.headers.has('www-authenticate'), `${pathname} unexpectedly challenges for credentials.`);
  assert(response.headers.get('referrer-policy') === 'no-referrer', `${pathname} lacks no-referrer.`);
  assert(response.headers.get('x-content-type-options') === 'nosniff', `${pathname} lacks nosniff.`);
  assert(response.headers.get('x-frame-options') === 'DENY', `${pathname} lacks frame denial.`);
  assert(
    response.headers.get('content-security-policy')?.includes("default-src 'self'"),
    `${pathname} lacks the same-origin CSP.`
  );
  assert(!response.headers.has('access-control-allow-origin'), `${pathname} unexpectedly enables CORS.`);
}

async function request(pathname, { method = 'GET', headers = {} } = {}) {
  return fetch(`${origin}${pathname}`, { method, redirect: 'manual', headers });
}

try {
  await waitUntilReady();

  for (const method of ['GET', 'HEAD']) {
    const redirect = await request('/reading', { method });
    assert(redirect.status === 308, `${method} /reading returned ${redirect.status}.`);
    assert(redirect.headers.get('location') === '/reading/', `${method} /reading has the wrong target.`);
    assert((await redirect.text()) === '', `${method} /reading returned a body.`);
    assertSecurityHeaders(redirect, `${method} /reading`, pageCache);
  }

  for (const pathname of ['/reading/', '/reading/index.html', '/reading/index.txt']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await request(pathname, { method });
      const body = await response.text();
      assert(response.status === 200, `Anonymous ${method} ${pathname} returned ${response.status}.`);
      if (method === 'HEAD') assert(body === '', `HEAD ${pathname} returned a body.`);
      assertSecurityHeaders(response, `${method} ${pathname}`, pageCache);
    }
  }

  for (const filename of filenames) {
    const pathname = `/reading/data/${filename}`;
    for (const method of ['GET', 'HEAD']) {
      const response = await request(pathname, { method });
      const body = await response.text();
      assert(response.status === 200, `Anonymous ${method} ${pathname} returned ${response.status}.`);
      if (method === 'GET') {
        assert(
          JSON.stringify(JSON.parse(body)) === JSON.stringify(expectedPublicData.get(filename)),
          `${pathname} did not return its strict public DTO.`
        );
      }
      else assert(body === '', `HEAD ${pathname} returned a body.`);
      assertSecurityHeaders(response, `${method} ${pathname}`, dataCache);
    }
  }

  const legacyHeaderResponse = await request('/reading/data/library.json', {
    headers: { Authorization: 'Basic obsolete-credential' },
  });
  assert(legacyHeaderResponse.status === 200, 'An obsolete Authorization header changed public access.');
  assert((await legacyHeaderResponse.text()).includes(canary), 'Public data was hidden by an obsolete auth header.');
  assertSecurityHeaders(legacyHeaderResponse, 'legacy Authorization request', dataCache);

  for (const pathname of [
    '/reading/data/export.json',
    '/reading/data/thesis_reference_lookup.json',
    '/reading/data/not-an-export.json',
    '/reading/data/weekly.json',
    '/reading/weekly',
    '/reading/weekly/2026-09-15',
  ]) {
    const response = await request(pathname);
    const body = await response.text();
    assert(response.status === 404, `Disallowed path ${pathname} returned ${response.status}.`);
    assert(!body.includes(canary), `Disallowed path ${pathname} exposed the synthetic canary.`);
    assertSecurityHeaders(response, pathname, 'no-store');
  }

  for (const pathname of ['/reading', '/reading/', '/reading/data/library.json']) {
    const response = await request(pathname, { method: 'POST' });
    assert(response.status === 405, `POST ${pathname} returned ${response.status}.`);
    assert(response.headers.get('allow') === 'GET, HEAD', `POST ${pathname} has the wrong Allow header.`);
    assertSecurityHeaders(response, `POST ${pathname}`, 'no-store');
  }

  const repeat = await request('/reading/data/library.json');
  assert(repeat.status === 200, `Repeated anonymous public read returned ${repeat.status}.`);
  assert((await repeat.text()).includes(canary), 'Repeated anonymous read lost the public data.');

  process.stdout.write('Reading local security checks passed (public GET/HEAD, headers, allowlist, methods, repeat reads).\n');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  await rm(dataDir, { recursive: true, force: true });
}
