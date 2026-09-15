import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { projectReadingPublicFile } from '../functions/reading/_public-data.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function transpileTypeScript(relativeUrl, importMap = {}) {
  const fileUrl = new URL(relativeUrl, import.meta.url);
  let source = await readFile(fileUrl, 'utf8');
  for (const [specifier, replacement] of Object.entries(importMap)) {
    source = source.replaceAll(`'${specifier}'`, `'${replacement}'`);
  }
  const result = ts.transpileModule(source, {
    fileName: fileUrl.pathname,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  assert(
    errors.length === 0,
    `Could not transpile ${relativeUrl}; diagnostics: ${errors.map((item) => item.code).join(', ')}.`
  );
  return `data:text/javascript;base64,${Buffer.from(result.outputText, 'utf8').toString('base64')}`;
}

async function importTypeScript(relativeUrl, importMap = {}) {
  return import(await transpileTypeScript(relativeUrl, importMap));
}

function routeMatches(pattern, pathname) {
  const escapedParts = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escapedParts.join('.*')}$`).test(pathname);
}

async function assertReadingRoutes(filename, label) {
  const routes = JSON.parse(await readFile(filename, 'utf8'));
  assert(routes.version === 1, `${label} must use Cloudflare routes schema version 1.`);
  assert(Array.isArray(routes.include) && Array.isArray(routes.exclude), `${label} has malformed route lists.`);
  for (const pathname of [
    '/reading',
    '/reading/',
    '/reading/index.html',
    '/reading/index.txt',
    '/reading/data/library.json',
    '/reading/data/view_config.json',
    '/reading/weekly/',
    '/reading/weekly/index.html',
    '/reading/weekly/index.txt',
    '/reading/weekly/data/topics.json',
  ]) {
    const included = routes.include.some((pattern) => routeMatches(pattern, pathname));
    const excluded = routes.exclude.some((pattern) => routeMatches(pattern, pathname));
    assert(included && !excluded, `${label} does not send ${pathname} through Pages Functions.`);
  }
  assert(
    routes.include.some((pattern) => routeMatches(pattern, '/api/traffic')),
    `${label} no longer sends the existing traffic endpoint through Pages Functions.`
  );
}

function assertSecurityHeaders(response, cacheControl) {
  assert(response.headers.get('cache-control') === cacheControl, 'Unexpected Reading cache policy.');
  assert(response.headers.get('referrer-policy') === 'no-referrer', 'Reading response lacks no-referrer.');
  assert(response.headers.get('x-content-type-options') === 'nosniff', 'Reading response lacks nosniff.');
  assert(response.headers.get('x-frame-options') === 'DENY', 'Reading response lacks frame denial.');
  assert(
    response.headers.get('content-security-policy')?.includes("default-src 'self'"),
    'Reading response lacks the same-origin CSP.'
  );
  assert(!response.headers.has('access-control-allow-origin'), 'Reading response exposes permissive CORS.');
  assert(!response.headers.has('www-authenticate'), 'Public Reading response must not issue an auth challenge.');
  assert(!response.headers.has('x-robots-tag'), 'Public Reading response must not opt out of indexing.');
}

const PAGE_CACHE = 'public, max-age=0, must-revalidate';
const DATA_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=60';
const ERROR_CACHE = 'no-store';
const securityModule = await transpileTypeScript('../functions/reading/_security.ts');
const weeklyAuthModule = await transpileTypeScript('../functions/reading/weekly/_auth.ts');
const publicDataSource = await readFile(new URL('../functions/reading/_public-data.mjs', import.meta.url), 'utf8');
const publicDataModule = `data:text/javascript;base64,${Buffer.from(publicDataSource, 'utf8').toString('base64')}`;
const [{ onRequest: secureReading }, { onRequest: readData }] = await Promise.all([
  importTypeScript('../functions/reading/_middleware.ts', {
    './_security': securityModule,
    './weekly/_auth': weeklyAuthModule,
  }),
  importTypeScript('../functions/reading/data/[filename].ts', {
    '../_security': securityModule,
    '../_public-data.mjs': publicDataModule,
  }),
]);

await assertReadingRoutes(new URL('../public/_routes.json', import.meta.url), 'public/_routes.json');
const builtRoutes = new URL('../out/_routes.json', import.meta.url);
const builtOutput = new URL('../out/', import.meta.url);
if (existsSync(builtOutput)) {
  assert(existsSync(builtRoutes), 'Built output is missing out/_routes.json.');
  await assertReadingRoutes(builtRoutes, 'out/_routes.json');
}

const request = (pathname = '/reading/', method = 'GET', headers = {}) =>
  new Request(`https://example.test${pathname}`, { headers, method });

for (const method of ['GET', 'HEAD']) {
  let nextCalls = 0;
  const redirect = await secureReading({
    request: request('/reading', method),
    next: async () => {
      nextCalls += 1;
      return new Response('must not run');
    },
  });
  assert(redirect.status === 308, `${method} /reading must redirect.`);
  assert(redirect.headers.get('location') === '/reading/', 'Exact /reading redirect has the wrong target.');
  assert((await redirect.text()) === '', `${method} /reading redirect must not contain a body.`);
  assert(nextCalls === 0, `${method} /reading redirect must not call the downstream handler.`);
  assertSecurityHeaders(redirect, PAGE_CACHE);
}

for (const pathname of [
  '/reading/data/weekly.json',
  '/reading/%77eekly',
  '/reading/weekly%2F2026-09-15',
  '/reading/data%2Fweekly.json',
  '/reading/weekly%ZZ',
]) {
  let nextCalls = 0;
  const denied = await secureReading({
    request: request(pathname),
    next: async () => {
      nextCalls += 1;
      return new Response('must not run');
    },
  });
  assert(denied.status === 404, `${pathname} must remain unavailable until separately authenticated.`);
  assert(nextCalls === 0, `${pathname} reached the downstream handler.`);
  assertSecurityHeaders(denied, ERROR_CACHE);
}

let writeNextCalls = 0;
const rejectedWrite = await secureReading({
  request: request('/reading/', 'POST'),
  next: async () => {
    writeNextCalls += 1;
    return new Response('must not run');
  },
});
assert(rejectedWrite.status === 405, 'Reading middleware must reject writes.');
assert(rejectedWrite.headers.get('allow') === 'GET, HEAD', 'Reading write rejection has the wrong Allow header.');
assert(writeNextCalls === 0, 'Rejected Reading write reached the downstream handler.');
assertSecurityHeaders(rejectedWrite, ERROR_CACHE);

const publicPage = await secureReading({
  request: request('/reading/', 'GET', { Authorization: 'Basic obsolete-credential' }),
  next: async () => new Response('public shell', {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'private, no-store',
      'WWW-Authenticate': 'Basic realm="obsolete"',
      'X-Robots-Tag': 'noindex',
    },
  }),
});
assert(publicPage.status === 200, 'Anonymous Reading page did not pass through middleware.');
assert((await publicPage.text()) === 'public shell', 'Public downstream response was not preserved.');
assertSecurityHeaders(publicPage, PAGE_CACHE);

const missingPage = await secureReading({
  request: request('/reading/missing'),
  next: async () => new Response('missing', { status: 404, headers: { 'Cache-Control': 'public' } }),
});
assert(missingPage.status === 404, 'Downstream Reading 404 was not preserved.');
assertSecurityHeaders(missingPage, ERROR_CACHE);

const downstreamFailure = await secureReading({
  request: request(),
  next: async () => { throw new Error('synthetic downstream failure'); },
});
assert(downstreamFailure.status === 503, 'Downstream failures must fail closed.');
assertSecurityHeaders(downstreamFailure, ERROR_CACHE);

const fixtureLibrary = JSON.parse(
  await readFile(new URL('../tests/fixtures/reading/library.json', import.meta.url), 'utf8')
);
const publicLibrary = projectReadingPublicFile('library.json', fixtureLibrary, 'private');
const createObject = (body) => ({
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(typeof body === 'string' ? new TextEncoder().encode(body) : body);
      controller.close();
    },
  }),
});
let bucketReads = 0;
const bucket = {
  async get(key) {
    bucketReads += 1;
    return key === 'releases/test-release/library.json'
      ? createObject(JSON.stringify(publicLibrary))
      : null;
  },
};
const defaultEnv = { READING_DATA: bucket, READING_DATA_PREFIX: 'releases/test-release' };
const dataContext = (method, filename, env = defaultEnv, headers = {}) => ({
  request: new Request(`https://example.test/reading/data/${String(filename)}`, { method, headers }),
  env,
  params: { filename },
});

assert((await readData(dataContext('POST', 'library.json'))).status === 405, 'Data route must reject writes.');
assert(bucketReads === 0, 'Rejected data write reached R2.');
for (const filename of ['export.json', 'thesis_reference_lookup.json', 'other.json']) {
  const denied = await readData(dataContext('GET', filename));
  assert(denied.status === 404, `Unlisted ${filename} must not exist.`);
  assertSecurityHeaders(denied, ERROR_CACHE);
}
assert(bucketReads === 0, 'Unlisted data path reached R2.');
assert((await readData(dataContext('GET', ['library.json']))).status === 404, 'Array filename must be rejected.');
assert((await readData(dataContext('GET', 'library.json', {}))).status === 503, 'Missing R2 config must fail closed.');
assert(
  (await readData(dataContext('GET', 'library.json', { READING_DATA: bucket, READING_DATA_PREFIX: '../escape' }))).status === 503,
  'Invalid R2 prefix must fail closed.'
);
assert(bucketReads === 0, 'Invalid R2 config reached the bucket.');

const dataGet = await readData(dataContext('GET', 'library.json'));
const dataBody = await dataGet.text();
assert(dataGet.status === 200, 'Anonymous R2 GET failed.');
assert(JSON.stringify(JSON.parse(dataBody)) === JSON.stringify(publicLibrary), 'R2 GET did not return the strict public DTO.');
for (const forbidden of ['source_document', 'generated_on', 'curation_notice', '"visibility":"private"']) {
  assert(!dataBody.includes(forbidden), `R2 GET leaked forbidden library content: ${forbidden}.`);
}
assertSecurityHeaders(dataGet, DATA_CACHE);
assert((dataGet.headers.get('content-type') || '').includes('application/json'), 'R2 response lacks JSON content type.');

const dataHead = await readData(dataContext('HEAD', 'library.json'));
assert(dataHead.status === 200 && (await dataHead.text()) === '', 'Anonymous R2 HEAD must succeed without a body.');
assertSecurityHeaders(dataHead, DATA_CACHE);
assert((await readData(dataContext('GET', 'threads.json'))).status === 404, 'Missing R2 object must return 404.');

function envWithObject(value) {
  return {
    READING_DATA_PREFIX: 'releases/test-release',
    READING_DATA: {
      async get() {
        return createObject(typeof value === 'string' ? value : JSON.stringify(value));
      },
    },
  };
}

async function assertRejectedObject(method, value, label, canary = 'private-canary') {
  const rejected = await readData(dataContext(method, 'library.json', envWithObject(value)));
  const body = await rejected.text();
  assert(rejected.status === 503, label);
  assert(!body.includes(canary), `${label} Error response leaked nested private data.`);
  assertSecurityHeaders(rejected, ERROR_CACHE);
}

const privateObject = structuredClone(fixtureLibrary);
privateObject.source_document.body_scope.private_canary = 'private-canary';
await assertRejectedObject('GET', privateObject, 'A private R2 object must fail closed.');
await assertRejectedObject('HEAD', privateObject, 'HEAD must validate and reject a private R2 object.');

const unknownFieldObject = structuredClone(publicLibrary);
unknownFieldObject.papers[0].verification.private_canary = 'private-canary';
await assertRejectedObject('GET', unknownFieldObject, 'A public object with unknown nested fields must fail closed.');

const wrongTypeObject = structuredClone(publicLibrary);
wrongTypeObject.papers[0].title = { nested: { private_canary: 'private-canary' } };
await assertRejectedObject('GET', wrongTypeObject, 'A public object with the wrong allowed-field type must fail closed.');

const userinfoObject = structuredClone(publicLibrary);
userinfoObject.papers[0].verification.sources[0].url = 'https://private-canary:secret@example.com/source';
await assertRejectedObject('GET', userinfoObject, 'A public object containing URL userinfo must fail closed.');

await assertRejectedObject('GET', '{malformed-json', 'Malformed R2 JSON must fail closed.');

const failingBucket = {
  async get() { throw new Error('synthetic R2 failure'); },
};
const failedData = await readData(dataContext('GET', 'library.json', {
  READING_DATA: failingBucket,
  READING_DATA_PREFIX: 'releases/test-release',
}));
assert(failedData.status === 503, 'R2 failures must fail closed.');
assertSecurityHeaders(failedData, ERROR_CACHE);

const composedContext = dataContext('GET', 'library.json');
const composedData = await secureReading({
  request: composedContext.request,
  next: () => readData(composedContext),
});
assert(composedData.status === 200, 'Reading middleware did not pass the public data response.');
assert(JSON.stringify(JSON.parse(await composedData.text())) === JSON.stringify(publicLibrary), 'Composed data response lost its body.');
assertSecurityHeaders(composedData, DATA_CACHE);

process.stdout.write('Reading Cloudflare Function checks passed (public routing, security headers, allowlist, fail-closed R2, GET/HEAD).\n');
