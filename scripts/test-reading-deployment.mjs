import { randomBytes } from 'node:crypto';

const DATA_FILES = [
  'library.json',
  'relations.json',
  'threads.json',
  'view_config.json',
];
const PROTECTED_PATHS = [
  '/reading/',
  '/reading/index.html',
  '/reading/index.txt',
  ...DATA_FILES.map((filename) => `/reading/data/${filename}`),
];
const DISALLOWED_PATHS = [
  '/reading/data/export.json',
  '/reading/data/thesis_reference_lookup.json',
];
const PUBLIC_PATHS = [
  '/',
  '/publications/',
  '/learning/',
  '/search-index.json',
];
const MAX_BODY_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

let failureCount = 0;

function report(result, origin, method, pathname, status) {
  const safeOrigin = origin || '-';
  const safePath = `${method || '-'} ${pathname || '-'}`;
  process.stdout.write(
    `origin=${JSON.stringify(safeOrigin)} path=${JSON.stringify(safePath)} status=${status} ${result}\n`
  );
  if (result !== 'PASS') failureCount += 1;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireCondition(condition) {
  if (!condition) throw new Error('check failed');
}

function normalizeOrigin(input) {
  const url = new URL(input);
  requireCondition(url.username === '' && url.password === '');
  requireCondition(url.pathname === '/' && url.search === '' && url.hash === '');

  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
  requireCondition(
    url.protocol === 'https:'
      || (url.protocol === 'http:' && loopbackHosts.has(url.hostname))
  );
  return url.origin;
}

async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    requireCondition(size <= 8 * 1024);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function readCredentials() {
  const combined = process.env.READING_TEST_CREDENTIALS;
  const username = process.env.READING_TEST_USERNAME;
  const password = process.env.READING_TEST_PASSWORD;
  const hasCombined = combined !== undefined;
  const hasSeparate = username !== undefined || password !== undefined;

  requireCondition(!(hasCombined && hasSeparate));
  requireCondition(!hasSeparate || (username !== undefined && password !== undefined));

  let credentials;
  if (hasCombined) {
    credentials = combined;
  } else if (hasSeparate) {
    credentials = `${username}:${password}`;
  } else {
    requireCondition(!process.stdin.isTTY);
    credentials = await readStdin();
  }

  requireCondition(
    typeof credentials === 'string'
      && credentials.length > 1
      && credentials.length <= 4096
      && credentials.includes(':')
      && !/[\r\n\0]/.test(credentials)
  );
  delete process.env.READING_TEST_CREDENTIALS;
  delete process.env.READING_TEST_USERNAME;
  delete process.env.READING_TEST_PASSWORD;
  return credentials;
}

async function readBody(response) {
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

function headerTokens(headers, name) {
  return (headers.get(name) || '')
    .toLowerCase()
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function contentSecurityPolicyDirectives(value) {
  const directives = new Map();
  for (const item of value.split(';')) {
    const [name, ...tokens] = item.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), tokens);
  }
  return directives;
}

function assertReadingSecurityHeaders(response) {
  const cacheControl = headerTokens(response.headers, 'cache-control');
  const robots = headerTokens(response.headers, 'x-robots-tag');
  const contentSecurityPolicy = contentSecurityPolicyDirectives(
    response.headers.get('content-security-policy') || ''
  );

  requireCondition(cacheControl.includes('private'));
  requireCondition(cacheControl.includes('no-store'));
  requireCondition(robots.includes('noindex'));
  requireCondition(robots.includes('nofollow'));
  requireCondition(robots.includes('noarchive'));
  requireCondition(response.headers.get('referrer-policy')?.toLowerCase() === 'no-referrer');
  requireCondition(response.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff');
  requireCondition(response.headers.get('x-frame-options')?.toUpperCase() === 'DENY');
  requireCondition(contentSecurityPolicy.get('default-src')?.includes("'self'"));
  requireCondition(contentSecurityPolicy.get('object-src')?.includes("'none'"));
  requireCondition(contentSecurityPolicy.get('frame-ancestors')?.includes("'none'"));
  requireCondition(!response.headers.has('access-control-allow-origin'));
}

function assertBasicChallenge(response) {
  requireCondition(/^Basic(?:[ \t]|$)/i.test(response.headers.get('www-authenticate') || ''));
}

function assertNoChallenge(response) {
  requireCondition(!response.headers.has('www-authenticate'));
}

function parseReadingJson(filename, body, canary) {
  const value = JSON.parse(body);
  requireCondition(isRecord(value));
  requireCondition(value.schema_version === '1.0.0');
  requireCondition(value.visibility === 'private');

  if (filename === 'library.json') {
    requireCondition(Array.isArray(value.papers));
    requireCondition(isRecord(value.source_document));
    requireCondition(body.includes(canary));
  } else if (filename === 'relations.json') {
    requireCondition(Array.isArray(value.edges));
    requireCondition(Array.isArray(value.hypothesis_edges));
  } else if (filename === 'threads.json') {
    requireCondition(Array.isArray(value.threads));
  } else {
    requireCondition(isRecord(value.graph));
    requireCondition(typeof value.default_view === 'string');
  }
}

async function request(origin, pathname, { method = 'GET', authorization } = {}) {
  const headers = authorization ? { Authorization: authorization } : {};
  const response = await fetch(`${origin}${pathname}`, {
    method,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await readBody(response);
  return { response, body };
}

async function check(origin, pathname, options, validate) {
  const method = options?.method || 'GET';
  let status = 'NETWORK';
  try {
    const result = await request(origin, pathname, options);
    status = result.response.status;
    validate(result.response, result.body);
    report('PASS', origin, method, pathname, status);
    return result;
  } catch {
    report('FAIL', origin, method, pathname, status);
    return null;
  }
}

async function verifyOrigin(origin, authorization, invalidAuthorization, canary) {
  for (const method of ['GET', 'HEAD']) {
    await check(origin, '/reading', { method }, (response, body) => {
      requireCondition(response.status === 308);
      assertNoChallenge(response);
      assertReadingSecurityHeaders(response);
      requireCondition(body === '');

      const location = response.headers.get('location');
      requireCondition(location !== null);
      const target = new URL(location, `${origin}/reading`);
      requireCondition(target.origin === origin);
      requireCondition(target.pathname === '/reading/');
      requireCondition(target.search === '' && target.hash === '');
    });
  }

  for (const pathname of PROTECTED_PATHS) {
    for (const method of ['GET', 'HEAD']) {
      await check(origin, pathname, { method }, (response, body) => {
        requireCondition(response.status === 401);
        assertBasicChallenge(response);
        assertReadingSecurityHeaders(response);
        requireCondition(!body.includes(canary));
        if (method === 'HEAD') requireCondition(body === '');
      });
    }
  }

  for (const pathname of PROTECTED_PATHS) {
    await check(
      origin,
      pathname,
      { authorization: invalidAuthorization },
      (response, body) => {
        requireCondition(response.status === 401);
        assertBasicChallenge(response);
        assertReadingSecurityHeaders(response);
        requireCondition(!body.includes(canary));
      }
    );
  }

  await check(origin, '/reading/', { authorization }, (response) => {
    requireCondition(response.status === 200);
    assertNoChallenge(response);
    assertReadingSecurityHeaders(response);
    requireCondition((response.headers.get('content-type') || '').toLowerCase().includes('text/html'));
  });

  for (const filename of DATA_FILES) {
    const pathname = `/reading/data/${filename}`;
    await check(origin, pathname, { authorization }, (response, body) => {
      requireCondition(response.status === 200);
      assertNoChallenge(response);
      assertReadingSecurityHeaders(response);
      requireCondition(
        (response.headers.get('content-type') || '').toLowerCase().includes('application/json')
      );
      parseReadingJson(filename, body, canary);
    });
  }

  for (const pathname of DISALLOWED_PATHS) {
    await check(origin, pathname, { authorization }, (response, body) => {
      requireCondition(response.status === 404);
      assertNoChallenge(response);
      assertReadingSecurityHeaders(response);
      requireCondition(!body.includes(canary));
    });
  }

  const cachePath = '/reading/data/library.json';
  await check(origin, cachePath, { authorization }, (response, body) => {
    requireCondition(response.status === 200);
    assertNoChallenge(response);
    assertReadingSecurityHeaders(response);
    parseReadingJson('library.json', body, canary);
  });
  await check(origin, cachePath, {}, (response, body) => {
    requireCondition(response.status === 401);
    assertBasicChallenge(response);
    assertReadingSecurityHeaders(response);
    requireCondition(!body.includes(canary));
  });

  for (const pathname of PUBLIC_PATHS) {
    await check(origin, pathname, {}, (response, body) => {
      requireCondition(response.status === 200);
      assertNoChallenge(response);
      requireCondition(!body.includes(canary));
    });
  }
}

let origins;
let credentials;
let canary;
try {
  requireCondition(process.argv.length > 2);
  origins = [...new Set(process.argv.slice(2).map(normalizeOrigin))];
  requireCondition(origins.length > 0);
  credentials = await readCredentials();
  canary = process.env.READING_TEST_CANARY || 'syntheticPrimer';
  requireCondition(canary.length > 0 && canary.length <= 1024 && !/[\r\n\0]/.test(canary));
} catch {
  report('FAIL', '-', '-', '-', 'CONFIG');
  process.exitCode = 1;
}

if (origins && credentials && canary) {
  const authorization = `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
  credentials = undefined;
  const invalidAuthorization = `Basic ${Buffer.from(
    `invalid:${randomBytes(32).toString('hex')}`,
    'utf8'
  ).toString('base64')}`;

  for (const origin of origins) {
    await verifyOrigin(origin, authorization, invalidAuthorization, canary);
  }
  if (failureCount > 0) process.exitCode = 1;
}
