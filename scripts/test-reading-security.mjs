import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const canary = 'SYNTHETIC_READING_CANARY_74f9b2c1';
const credentials = 'reading-test:test-only-password';
const credentialHash = createHash('sha256').update(credentials, 'utf8').digest('hex');
const authorization = `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'reading-security-'));
const filenames = ['library.json', 'relations.json', 'threads.json', 'view_config.json'];

await Promise.all(filenames.map((filename) => writeFile(
  path.join(dataDir, filename),
  JSON.stringify({ filename, canary }),
  { mode: 0o600 }
)));

const child = spawn(process.execPath, ['scripts/serve-private-reading.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    READING_HOST: '127.0.0.1',
    READING_PRIVATE_DATA_DIR: dataDir,
    READING_BASIC_AUTH_SHA256: credentialHash,
    READING_PORT: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverError = '';
let serverOutput = '';
let origin = '';
child.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
  const match = /Private Reading server listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(serverOutput);
  if (match) origin = match[1];
});
child.stderr.on('data', (chunk) => {
  serverError += chunk.toString();
});

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Local private server exited before becoming ready. ${serverError}`);
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
  throw new Error(`Local private server did not start. ${serverError}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPrivateHeaders(response, pathname) {
  assert(response.headers.get('cache-control') === 'private, no-store', `${pathname} lacks private no-store.`);
  assert(response.headers.get('x-robots-tag') === 'noindex, nofollow, noarchive', `${pathname} lacks robot exclusion headers.`);
  assert(response.headers.get('referrer-policy') === 'no-referrer', `${pathname} lacks no-referrer.`);
  assert(response.headers.get('x-content-type-options') === 'nosniff', `${pathname} lacks nosniff.`);
  assert(response.headers.get('x-frame-options') === 'DENY', `${pathname} lacks frame denial.`);
  assert(response.headers.get('content-security-policy')?.includes("default-src 'self'"), `${pathname} lacks the same-origin CSP.`);
}

async function request(pathname, { auth = false, method = 'GET' } = {}) {
  return fetch(`${origin}${pathname}`, {
    method,
    redirect: 'manual',
    headers: auth ? { Authorization: authorization } : {},
  });
}

try {
  await waitUntilReady();

  for (const method of ['GET', 'HEAD']) {
    const redirect = await request('/reading', { method });
    const body = await redirect.text();
    assert(redirect.status === 308, `${method} /reading returned ${redirect.status}.`);
    assert(redirect.headers.get('location') === '/reading/', `${method} /reading has the wrong redirect target.`);
    assert(!redirect.headers.has('www-authenticate'), `${method} /reading must not challenge at the site-root Basic Auth scope.`);
    assert(!body.includes(canary), `${method} /reading exposed the synthetic canary.`);
    assertPrivateHeaders(redirect, `${method} /reading redirect`);
  }

  const authenticatedRedirect = await request('/reading', { auth: true });
  assert(authenticatedRedirect.status === 308, 'Authenticated /reading must use the same canonical redirect.');
  assert(!authenticatedRedirect.headers.has('www-authenticate'), 'Authenticated /reading redirect unexpectedly challenged.');

  for (const pathname of [
    '/reading/',
    '/reading/index.html',
    '/reading/index.txt',
    '/reading/data/library.json',
    '/reading/data/relations.json',
    '/reading/data/threads.json',
    '/reading/data/view_config.json',
    '/reading/data/not-an-export.json',
  ]) {
    const response = await request(pathname);
    const body = await response.text();
    assert(response.status === 401, `Unauthenticated ${pathname} returned ${response.status}.`);
    assert(!body.includes(canary), `Unauthenticated ${pathname} exposed the synthetic canary.`);
    assertPrivateHeaders(response, pathname);
    assert(response.headers.has('www-authenticate'), `${pathname} lacks the Basic authentication challenge.`);
  }

  const headResponse = await request('/reading/data/library.json', { method: 'HEAD' });
  assert(headResponse.status === 401, `Unauthenticated HEAD returned ${headResponse.status}.`);
  assert((await headResponse.text()) === '', 'HEAD returned a response body.');

  const invalidResponse = await fetch(`${origin}/reading/data/library.json`, {
    redirect: 'manual',
    headers: { Authorization: `Basic ${Buffer.from('wrong:credentials').toString('base64')}` },
  });
  assert(invalidResponse.status === 401, `Invalid credentials returned ${invalidResponse.status}.`);
  assert(!(await invalidResponse.text()).includes(canary), 'Invalid credentials exposed the synthetic canary.');
  assertPrivateHeaders(invalidResponse, '/reading/data/library.json with invalid credentials');

  const authorizedPage = await request('/reading/', { auth: true });
  assert(authorizedPage.status === 200, `Authorized Reading page returned ${authorizedPage.status}.`);
  assertPrivateHeaders(authorizedPage, 'authorized /reading/');

  const authorizedData = await request('/reading/data/library.json', { auth: true });
  const authorizedBody = await authorizedData.text();
  assert(authorizedData.status === 200, `Authorized data returned ${authorizedData.status}.`);
  assert(authorizedBody.includes(canary), 'Authorized data did not contain the synthetic canary.');
  assertPrivateHeaders(authorizedData, 'authorized /reading/data/library.json');

  const authorizedHead = await request('/reading/data/library.json', { auth: true, method: 'HEAD' });
  assert(authorizedHead.status === 200, `Authorized HEAD returned ${authorizedHead.status}.`);
  assert((await authorizedHead.text()) === '', 'Authorized HEAD returned a response body.');
  assertPrivateHeaders(authorizedHead, 'authorized HEAD /reading/data/library.json');

  for (const pathname of [
    '/reading/data/export.json',
    '/reading/data/thesis_reference_lookup.json',
  ]) {
    const response = await request(pathname, { auth: true });
    const body = await response.text();
    assert(response.status === 404, `Authorized disallowed path ${pathname} returned ${response.status}.`);
    assert(!body.includes(canary), `Disallowed path ${pathname} exposed the synthetic canary.`);
    assertPrivateHeaders(response, pathname);
  }

  const afterPrime = await request('/reading/data/library.json');
  const afterPrimeBody = await afterPrime.text();
  assert(afterPrime.status === 401, `Cache-prime regression returned ${afterPrime.status}.`);
  assert(!afterPrimeBody.includes(canary), 'Authenticated cache prime exposed data without credentials.');

  process.stdout.write('Reading local authentication checks passed (redirect-first scope, GET, HEAD, invalid/valid credentials, headers, allowlist, aliases, cache prime).\n');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  await rm(dataDir, { recursive: true, force: true });
}
