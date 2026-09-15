import { randomBytes } from 'node:crypto';
import { validateWeeklyTopics } from '../functions/reading/weekly/_contract.mjs';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const PROTECTED_PATHS = [
  '/reading/weekly/',
  '/reading/weekly/index.html',
  '/reading/weekly/index.txt',
  '/reading/weekly/data/topics.json',
];
let failures = 0;

function requireCondition(condition) {
  if (!condition) throw new Error('check failed');
}

function normalizeOrigin(input) {
  const url = new URL(input);
  requireCondition(url.protocol === 'https:');
  requireCondition(url.username === '' && url.password === '');
  requireCondition(url.pathname === '/' && url.search === '' && url.hash === '');
  return url.origin;
}

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    requireCondition(size <= 4096);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function credentials() {
  const value = process.env.READING_WEEKLY_TEST_CREDENTIALS ?? await readStdin();
  delete process.env.READING_WEEKLY_TEST_CREDENTIALS;
  requireCondition(value.length > 1 && value.length <= 4096 && value.includes(':'));
  requireCondition(!/[\r\n\0]/.test(value));
  return value;
}

async function body(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('check failed');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function tokens(headers, name) {
  return (headers.get(name) || '').toLowerCase().split(',').map((value) => value.trim()).filter(Boolean);
}

function assertPrivate(response, challenge = false) {
  const cache = tokens(response.headers, 'cache-control');
  requireCondition(cache.includes('private') && cache.includes('no-store'));
  requireCondition(tokens(response.headers, 'cdn-cache-control').includes('no-store'));
  requireCondition(tokens(response.headers, 'vary').includes('authorization'));
  const robots = tokens(response.headers, 'x-robots-tag');
  requireCondition(robots.includes('noindex') && robots.includes('nofollow') && robots.includes('noarchive'));
  requireCondition(response.headers.get('referrer-policy')?.toLowerCase() === 'no-referrer');
  requireCondition(response.headers.get('cross-origin-resource-policy')?.toLowerCase() === 'same-origin');
  requireCondition(response.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff');
  requireCondition(response.headers.get('x-frame-options')?.toUpperCase() === 'DENY');
  requireCondition((response.headers.get('content-security-policy') || '').includes("default-src 'self'"));
  requireCondition(!response.headers.has('access-control-allow-origin'));
  requireCondition(response.headers.has('www-authenticate') === challenge);
  if (challenge) requireCondition(/^Basic\b/i.test(response.headers.get('www-authenticate') || ''));
  requireCondition((response.headers.get('cf-cache-status') || '').toUpperCase() !== 'HIT');
}

async function request(origin, pathname, { method = 'GET', authorization } = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    method,
    redirect: 'manual',
    headers: authorization ? { Authorization: authorization } : {},
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return { response, body: await body(response) };
}

async function check(origin, pathname, options, validate) {
  const method = options?.method || 'GET';
  let status = 'NETWORK';
  try {
    const result = await request(origin, pathname, options);
    status = result.response.status;
    validate(result.response, result.body);
    process.stdout.write(`origin=${JSON.stringify(origin)} path=${JSON.stringify(`${method} ${pathname}`)} status=${status} PASS\n`);
  } catch {
    failures += 1;
    process.stdout.write(`origin=${JSON.stringify(origin)} path=${JSON.stringify(`${method} ${pathname}`)} status=${status} FAIL\n`);
  }
}

async function verify(origin, authorization, invalidAuthorization) {
  for (const method of ['GET', 'HEAD']) {
    await check(origin, '/reading/weekly', { method }, (response, responseBody) => {
      requireCondition(response.status === 308 && responseBody === '');
      requireCondition(new URL(response.headers.get('location'), origin).pathname === '/reading/weekly/');
      assertPrivate(response);
    });
  }

  for (const pathname of PROTECTED_PATHS) {
    for (const method of ['GET', 'HEAD']) {
      await check(origin, pathname, { method }, (response, responseBody) => {
        requireCondition(response.status === 401);
        if (method === 'HEAD') requireCondition(responseBody === '');
        assertPrivate(response, true);
      });
    }
    await check(origin, pathname, { authorization: invalidAuthorization }, (response) => {
      requireCondition(response.status === 401);
      assertPrivate(response, true);
    });
  }

  await check(origin, '/reading/weekly/', { authorization }, (response) => {
    requireCondition(response.status === 200);
    requireCondition((response.headers.get('content-type') || '').toLowerCase().includes('text/html'));
    assertPrivate(response);
  });

  await check(origin, '/reading/weekly/data/topics.json', { authorization }, (response, responseBody) => {
    requireCondition(response.status === 200);
    requireCondition((response.headers.get('content-type') || '').toLowerCase().includes('application/json'));
    validateWeeklyTopics(JSON.parse(responseBody));
    assertPrivate(response);
  });

  await check(origin, '/reading/weekly/data/topics.json', { method: 'HEAD', authorization }, (response, responseBody) => {
    requireCondition(response.status === 200 && responseBody === '');
    assertPrivate(response);
  });

  for (const pathname of ['/reading/weekly/data/export.json', '/reading/weekly/data/unknown.json']) {
    await check(origin, pathname, { authorization }, (response) => {
      requireCondition(response.status === 404);
      assertPrivate(response);
    });
  }

  await check(origin, '/reading/weekly/data/topics.json', { authorization }, (response) => {
    requireCondition(response.status === 200);
    assertPrivate(response);
  });
  await check(origin, '/reading/weekly/data/topics.json', {}, (response) => {
    requireCondition(response.status === 401);
    assertPrivate(response, true);
  });

  await check(origin, '/reading/', {}, (response) => {
    requireCondition(response.status === 200);
    requireCondition(!response.headers.has('www-authenticate'));
  });
}

let origins;
let suppliedCredentials;
try {
  requireCondition(process.argv.length > 2);
  origins = [...new Set(process.argv.slice(2).map(normalizeOrigin))];
  suppliedCredentials = await credentials();
} catch {
  process.stdout.write('origin="-" path="-" status=CONFIG FAIL\n');
  process.exitCode = 1;
}

if (origins && suppliedCredentials) {
  const authorization = `Basic ${Buffer.from(suppliedCredentials, 'utf8').toString('base64')}`;
  suppliedCredentials = undefined;
  const invalidAuthorization = `Basic ${Buffer.from(`invalid:${randomBytes(32).toString('hex')}`, 'utf8').toString('base64')}`;
  for (const origin of origins) await verify(origin, authorization, invalidAuthorization);
  if (failures > 0) process.exitCode = 1;
}
