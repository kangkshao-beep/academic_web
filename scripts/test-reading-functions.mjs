import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

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
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  assert(errors.length === 0, `Could not transpile ${relativeUrl}; diagnostics: ${errors.map((item) => item.code).join(', ')}.`);

  const encoded = Buffer.from(result.outputText, 'utf8').toString('base64');
  return `data:text/javascript;base64,${encoded}`;
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

const authModule = await transpileTypeScript('../functions/reading/_auth.ts');
const [{ onRequest: authenticate }, { onRequest: readData }] = await Promise.all([
  importTypeScript('../functions/reading/_middleware.ts', { './_auth': authModule }),
  importTypeScript('../functions/reading/data/[filename].ts', { '../_auth': authModule }),
]);

await assertReadingRoutes(new URL('../public/_routes.json', import.meta.url), 'public/_routes.json');
const builtRoutes = new URL('../out/_routes.json', import.meta.url);
const builtOutput = new URL('../out/', import.meta.url);
if (existsSync(builtOutput)) {
  assert(existsSync(builtRoutes), 'Built output is missing out/_routes.json.');
  await assertReadingRoutes(builtRoutes, 'out/_routes.json');
}

const credentials = '研究者:synthetic-strong-password';
const digest = createHash('sha256').update(credentials, 'utf8').digest('hex');
const authorization = `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
const request = (headers = {}, pathname = '/reading/', method = 'GET') =>
  new Request(`https://example.test${pathname}`, { headers, method });

let redirectNextCalls = 0;
const exactReadingRedirect = await authenticate({
  request: request({}, '/reading'),
  env: {},
  next: async () => {
    redirectNextCalls += 1;
    return new Response('must not run');
  },
});
assert(exactReadingRedirect.status === 308, 'Exact /reading must redirect before authentication.');
assert(exactReadingRedirect.headers.get('location') === '/reading/', 'Exact /reading redirect has the wrong target.');
assert(!exactReadingRedirect.headers.has('www-authenticate'), 'Exact /reading must not challenge at the site-root Basic Auth scope.');
assert(exactReadingRedirect.headers.get('cache-control') === 'private, no-store', 'Exact /reading redirect lacks private no-store.');
assert(exactReadingRedirect.headers.get('x-robots-tag') === 'noindex, nofollow, noarchive', 'Exact /reading redirect lacks robot exclusion.');
assert(exactReadingRedirect.headers.get('referrer-policy') === 'no-referrer', 'Exact /reading redirect lacks no-referrer.');
assert(exactReadingRedirect.headers.get('x-content-type-options') === 'nosniff', 'Exact /reading redirect lacks nosniff.');
assert(exactReadingRedirect.headers.get('x-frame-options') === 'DENY', 'Exact /reading redirect lacks frame denial.');
assert(exactReadingRedirect.headers.get('content-security-policy')?.includes("default-src 'self'"), 'Exact /reading redirect lacks CSP.');
assert((await exactReadingRedirect.text()) === '', 'Exact /reading redirect must not contain a body.');
assert(redirectNextCalls === 0, 'Exact /reading redirect must not call the downstream handler.');

const exactReadingHead = await authenticate({
  request: request({}, '/reading', 'HEAD'),
  env: {},
  next: async () => new Response('must not run'),
});
assert(exactReadingHead.status === 308 && (await exactReadingHead.text()) === '', 'HEAD /reading must return an empty redirect.');
assert(!exactReadingHead.headers.has('www-authenticate'), 'HEAD /reading must not issue a Basic Auth challenge.');

const missingConfig = await authenticate({
  request: request(),
  env: {},
  next: async () => new Response('should not run'),
});
assert(missingConfig.status === 503, 'Missing authentication config must fail closed.');

const invalidConfig = await authenticate({
  request: request(),
  env: { READING_BASIC_AUTH_SHA256: digest.toUpperCase() },
  next: async () => new Response('should not run'),
});
assert(invalidConfig.status === 503, 'Invalid authentication config must fail closed.');

for (const candidate of [
  null,
  'Basic not-base64!',
  `Basic ${Buffer.from([0xff]).toString('base64')}`,
  `Basic ${Buffer.from('wrong:value').toString('base64')}`,
]) {
  const headers = candidate ? { Authorization: candidate } : {};
  const response = await authenticate({
    request: request(headers),
    env: { READING_BASIC_AUTH_SHA256: digest },
    next: async () => new Response('should not run'),
  });
  assert(response.status === 401, 'Missing, malformed, and invalid credentials must return 401.');
  assert(response.headers.has('www-authenticate'), 'Denied requests must include a Basic challenge.');
}

const authorized = await authenticate({
  request: request({ Authorization: authorization }),
  env: { READING_BASIC_AUTH_SHA256: digest },
  next: async () => new Response('generic shell', {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  }),
});
assert(authorized.status === 200, 'Valid UTF-8 credentials must pass.');
assert((await authorized.text()) === 'generic shell', 'Authorized downstream response was not preserved.');
assert(authorized.headers.get('cache-control') === 'private, no-store', 'Authorized response must not be cached.');
assert(!authorized.headers.has('access-control-allow-origin'), 'Permissive downstream CORS must be removed.');
assert(authorized.headers.get('referrer-policy') === 'no-referrer', 'Authorized response lacks privacy headers.');

const downstreamFailure = await authenticate({
  request: request({ Authorization: authorization }),
  env: { READING_BASIC_AUTH_SHA256: digest },
  next: async () => { throw new Error('synthetic downstream failure'); },
});
assert(downstreamFailure.status === 503, 'Downstream failures must remain fail closed.');

const encoded = new TextEncoder().encode('{"synthetic":true}');
const createObject = () => ({
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  }),
});
const bucket = {
  async get(key) {
    return key === 'releases/test-release/library.json' ? createObject() : null;
  },
  async head(key) {
    return key === 'releases/test-release/library.json' ? {} : null;
  },
};
const dataContext = (
  method,
  filename,
  env = {
    READING_BASIC_AUTH_SHA256: digest,
    READING_DATA: bucket,
    READING_DATA_PREFIX: 'releases/test-release',
  },
  headers = { Authorization: authorization }
) => ({
  request: new Request(`https://example.test/reading/data/${filename}`, { method, headers }),
  env,
  params: { filename },
});

assert((await readData(dataContext('POST', 'library.json'))).status === 405, 'Data route must reject writes.');
assert((await readData(dataContext('GET', 'export.json'))).status === 404, 'Unlisted exports must not exist.');
assert(
  (await readData(dataContext('GET', 'library.json', { READING_BASIC_AUTH_SHA256: digest }))).status === 503,
  'Missing R2 binding must fail closed.'
);
assert(
  (await readData(dataContext('GET', 'library.json', {}))).status === 503,
  'Missing direct-handler authentication config must fail closed.'
);

const dataGet = await readData(dataContext('GET', 'library.json'));
assert(dataGet.status === 200 && (await dataGet.text()).includes('synthetic'), 'Authorized R2 GET failed.');
assert(dataGet.headers.get('cache-control') === 'private, no-store', 'R2 response must not be cached.');

const dataHead = await readData(dataContext('HEAD', 'library.json'));
assert(dataHead.status === 200 && (await dataHead.text()) === '', 'R2 HEAD must succeed without a body.');
assert((await readData(dataContext('GET', 'threads.json'))).status === 404, 'Missing R2 object must return 404.');

let protectedBucketReads = 0;
const protectedBucket = {
  async get(key) {
    protectedBucketReads += 1;
    return bucket.get(key);
  },
  async head(key) {
    protectedBucketReads += 1;
    return bucket.head(key);
  },
};

const directDenied = await readData(dataContext(
  'GET',
  'library.json',
  {
    READING_BASIC_AUTH_SHA256: digest,
    READING_DATA: protectedBucket,
    READING_DATA_PREFIX: 'releases/test-release',
  },
  {}
));
assert(directDenied.status === 401, 'Data handler must independently reject missing credentials.');
assert(protectedBucketReads === 0, 'Directly denied data requests must not reach R2.');

const protectedDataRequest = (headers = {}) => {
  const context = dataContext('GET', 'library.json', {
    READING_BASIC_AUTH_SHA256: digest,
    READING_DATA: protectedBucket,
    READING_DATA_PREFIX: 'releases/test-release',
  });
  context.request = new Request(context.request.url, { headers });
  return authenticate({
    request: context.request,
    env: { READING_BASIC_AUTH_SHA256: digest },
    next: () => readData(context),
  });
};

const deniedData = await protectedDataRequest();
assert(deniedData.status === 401, 'Directory middleware must deny an unauthenticated data request.');
assert(protectedBucketReads === 0, 'Denied data requests must not reach R2.');

const protectedData = await protectedDataRequest({ Authorization: authorization });
assert(protectedData.status === 200, 'Directory middleware must pass an authenticated data request.');
assert(protectedBucketReads === 1, 'Authenticated data requests must read the expected R2 object once.');
assert((await protectedData.text()).includes('synthetic'), 'Protected R2 response lost its body.');
assert(protectedData.headers.get('cache-control') === 'private, no-store', 'Protected data must remain private and no-store.');
assert(protectedData.headers.get('x-frame-options') === 'DENY', 'Protected data lacks middleware security headers.');

process.stdout.write('Reading Cloudflare Function checks passed (routing, fail-closed auth, headers, middleware composition, R2 GET/HEAD).\n');
