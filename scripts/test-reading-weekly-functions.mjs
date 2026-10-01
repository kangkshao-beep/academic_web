import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

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
  assert.equal(errors.length, 0, `Could not transpile ${relativeUrl}.`);
  return `data:text/javascript;base64,${Buffer.from(result.outputText, 'utf8').toString('base64')}`;
}

async function importTypeScript(relativeUrl, importMap = {}) {
  return import(await transpileTypeScript(relativeUrl, importMap));
}

function assertPrivateHeaders(response, { challenge = false } = {}) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert(
    (response.headers.get('vary') || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .includes('authorization')
  );
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(response.headers.has('access-control-allow-origin'), false);
  assert.equal(response.headers.has('www-authenticate'), challenge);
  if (challenge) assert.match(response.headers.get('www-authenticate') || '', /^Basic\b/);
}

function assertPublicHeaders(response, cacheControl = 'public, max-age=0, must-revalidate') {
  assert.equal(response.headers.get('cache-control'), cacheControl);
  assert.equal(response.headers.has('www-authenticate'), false);
  assert.equal(response.headers.has('x-robots-tag'), false);
  assert.equal(response.headers.has('access-control-allow-origin'), false);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy') || '', /default-src 'self'/);
}

const credentials = 'weekly-test:test-only-password';
const credentialHash = createHash('sha256').update(credentials, 'utf8').digest('hex');
const authorization = `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
const invalidAuthorization = `Basic ${Buffer.from('wrong:credentials', 'utf8').toString('base64')}`;
const defaultEnv = { READING_WEEKLY_BASIC_AUTH_SHA256: credentialHash };
const securityModule = await transpileTypeScript('../functions/reading/_security.ts');
const authModule = await transpileTypeScript('../functions/reading/weekly/_auth.ts');
const contractSource = await readFile(
  new URL('../functions/reading/weekly/_contract.mjs', import.meta.url),
  'utf8'
);
const contractModule = `data:text/javascript;base64,${Buffer.from(contractSource, 'utf8').toString('base64')}`;

const [{ onRequest: readingMiddleware }, { onRequest: weeklyData }] = await Promise.all([
  importTypeScript('../functions/reading/_middleware.ts', {
    './_security': securityModule,
    './weekly/_auth': authModule,
  }),
  importTypeScript('../functions/reading/weekly/data/[filename].ts', {
    '../_auth': authModule,
    '../_contract.mjs': contractModule,
  }),
]);

const request = (pathname, method = 'GET', auth = null) =>
  new Request(`https://example.test${pathname}`, {
    method,
    headers: auth ? { Authorization: auth } : {},
  });

for (const method of ['GET', 'HEAD']) {
  let nextCalls = 0;
  const response = await readingMiddleware({
    request: request('/reading/weekly', method),
    env: defaultEnv,
    next: async () => {
      nextCalls += 1;
      return new Response('must not run');
    },
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), '/reading/weekly/');
  assert.equal(await response.text(), '');
  assert.equal(nextCalls, 0);
  assertPublicHeaders(response);
}

const exactWrite = await readingMiddleware({
  request: request('/reading/weekly', 'POST'),
  env: defaultEnv,
  next: async () => new Response('must not run'),
});
assert.equal(exactWrite.status, 405);
assertPublicHeaders(exactWrite, 'no-store');

for (const pathname of [
  '/reading/%77eekly',
  '/reading/weekly%2Fdata%2Ftopics.json',
  '/reading/weekly%252Fdata',
  '/reading/weekly%5Cdata',
  '/reading//weekly/',
  '/reading/weekly%ZZ',
]) {
  let nextCalls = 0;
  const response = await readingMiddleware({
    request: request(pathname),
    env: defaultEnv,
    next: async () => {
      nextCalls += 1;
      return new Response('must not run');
    },
  });
  assert.equal(response.status, 404, `${pathname} did not fail before downstream.`);
  assert.equal(nextCalls, 0, `${pathname} reached downstream.`);
  assert.equal((await response.text()).includes('weekly-test'), false);
}

for (const pathname of ['/reading/weekly.html', '/reading/weekly.txt']) {
  let nextCalls = 0;
  const response = await readingMiddleware({
    request: request(pathname),
    env: defaultEnv,
    next: async () => {
      nextCalls += 1;
      return new Response('must not run');
    },
  });
  assert.equal(response.status, 404);
  assert.equal(nextCalls, 0);
  assertPublicHeaders(response, 'no-store');
}

for (const pathname of [
  '/reading/weekly/',
  '/reading/weekly/index.html',
  '/reading/weekly/index.txt',
  '/reading/weekly/?demo=1',
]) {
  for (const method of ['GET', 'HEAD']) {
    for (const auth of [null, invalidAuthorization, authorization]) {
      for (const env of [defaultEnv, {}]) {
        let nextCalls = 0;
        const response = await readingMiddleware({
          request: request(pathname, method, auth),
          env,
          next: async () => {
            nextCalls += 1;
            return new Response(method === 'HEAD' ? null : 'public teaching shell', {
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'private, no-store',
                'WWW-Authenticate': 'Basic realm="obsolete"',
                'X-Robots-Tag': 'noindex',
              },
            });
          },
        });
        assert.equal(
          response.status,
          200,
          `${pathname} must remain public without weekly auth configuration.`
        );
        assert.equal(await response.text(), method === 'HEAD' ? '' : 'public teaching shell');
        assert.equal(nextCalls, 1);
        assertPublicHeaders(response);
      }
    }
  }
}

for (const pathname of [
  '/reading/weekly/data',
  '/reading/weekly/data/topics.json',
  '/reading/weekly/data/unknown.json',
  '/reading/weekly/data/topics.json?demo=1',
]) {
  for (const auth of [null, invalidAuthorization]) {
    let nextCalls = 0;
    const response = await readingMiddleware({
      request: request(pathname, 'GET', auth),
      env: defaultEnv,
      next: async () => {
        nextCalls += 1;
        return new Response('must not run');
      },
    });
    assert.equal(response.status, 401, `${pathname} accepted absent or invalid credentials.`);
    assert.equal(nextCalls, 0, `${pathname} reached downstream without authorization.`);
    assertPrivateHeaders(response, { challenge: true });
  }
}

let authorizedNextCalls = 0;
const authorizedData = await readingMiddleware({
  request: request('/reading/weekly/data/topics.json', 'GET', authorization),
  env: defaultEnv,
  next: async () => {
    authorizedNextCalls += 1;
    return new Response('private weekly data', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
        Vary: 'Accept-Encoding',
        'X-Robots-Tag': 'index',
      },
    });
  },
});
assert.equal(authorizedData.status, 200);
assert.equal(await authorizedData.text(), 'private weekly data');
assert.equal(authorizedNextCalls, 1);
assertPrivateHeaders(authorizedData);
assert((authorizedData.headers.get('vary') || '').toLowerCase().includes('accept-encoding'));

const missingSecret = await readingMiddleware({
  request: request('/reading/weekly/data/topics.json'),
  env: {},
  next: async () => new Response('must not run'),
});
assert.equal(missingSecret.status, 503);
assertPrivateHeaders(missingSecret);

const privateWrite = await readingMiddleware({
  request: request('/reading/weekly/data/topics.json', 'POST', authorization),
  env: defaultEnv,
  next: async () => {
    assert.fail('Rejected data write reached downstream.');
  },
});
assert.equal(privateWrite.status, 405);
assert.equal(privateWrite.headers.get('allow'), 'GET, HEAD');
assertPrivateHeaders(privateWrite);

const missingPublicPage = await readingMiddleware({
  request: request('/reading/weekly/missing'),
  env: {},
  next: async () => new Response('Not found.', { status: 404 }),
});
assert.equal(missingPublicPage.status, 404);
assertPublicHeaders(missingPublicPage, 'no-store');

for (const pathname of [
  '/reading/weekly/',
  '/reading/weekly/index.html',
  '/reading/weekly/index.txt',
]) {
  for (const auth of [null, authorization]) {
    const rejectedWrite = await readingMiddleware({
      request: request(pathname, 'POST', auth),
      env: defaultEnv,
      next: async () => {
        assert.fail('Rejected page write reached downstream.');
      },
    });
    assert.equal(rejectedWrite.status, 405);
    assert.equal(rejectedWrite.headers.get('allow'), 'GET, HEAD');
    assertPublicHeaders(rejectedWrite, 'no-store');
  }
}

const downstreamFailure = await readingMiddleware({
  request: request('/reading/weekly/', 'GET', authorization),
  env: defaultEnv,
  next: async () => {
    throw new Error('synthetic downstream failure');
  },
});
assert.equal(downstreamFailure.status, 503);
assertPublicHeaders(downstreamFailure, 'no-store');

const privateDownstreamFailure = await readingMiddleware({
  request: request('/reading/weekly/data/topics.json', 'GET', authorization),
  env: defaultEnv,
  next: async () => {
    throw new Error('synthetic downstream failure');
  },
});
assert.equal(privateDownstreamFailure.status, 503);
assertPrivateHeaders(privateDownstreamFailure);

const fixture = JSON.parse(
  await readFile(new URL('../tests/fixtures/reading-weekly/topics.json', import.meta.url), 'utf8')
);
fixture.topics[0].locales.en.question += ' SYNTHETIC_WEEKLY_PRIVATE_CANARY_83c12d';
const createObject = (body) => ({
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(typeof body === 'string' ? new TextEncoder().encode(body) : body);
      controller.close();
    },
  }),
});
let bucketReads = 0;
let lastKey = '';
const bucket = {
  async get(key) {
    bucketReads += 1;
    lastKey = key;
    return key === 'weekly/releases/synthetic-v1/topics.json'
      ? createObject(JSON.stringify(fixture))
      : null;
  },
};
const dataEnv = {
  ...defaultEnv,
  READING_DATA: bucket,
  READING_WEEKLY_DATA_PREFIX: 'weekly/releases/synthetic-v1',
};
const dataContext = (method, filename, auth = authorization, env = dataEnv) => ({
  request: request('/reading/weekly/data/topics.json', method, auth),
  env,
  params: { filename },
});

for (const auth of [null, invalidAuthorization]) {
  const response = await weeklyData(dataContext('GET', 'topics.json', auth));
  assert.equal(response.status, 401);
  assert.equal((await response.text()).includes('SYNTHETIC_WEEKLY_PRIVATE_CANARY_83c12d'), false);
  assertPrivateHeaders(response, { challenge: true });
}
assert.equal(bucketReads, 0, 'Unauthorized weekly data request reached R2.');

assert.equal((await weeklyData(dataContext('GET', 'topics.json', authorization, {}))).status, 503);
assert.equal(bucketReads, 0, 'Missing secret reached R2.');
assert.equal((await weeklyData(dataContext('POST', 'topics.json'))).status, 405);
assert.equal(bucketReads, 0, 'Rejected weekly write reached R2.');
assert.equal((await weeklyData(dataContext('GET', 'unknown.json'))).status, 404);
assert.equal((await weeklyData(dataContext('GET', ['topics.json']))).status, 404);
assert.equal(bucketReads, 0, 'Unknown weekly filename reached R2.');
assert.equal(
  (
    await weeklyData(
      dataContext('GET', 'topics.json', authorization, {
        ...dataEnv,
        READING_WEEKLY_DATA_PREFIX: '../escape',
      })
    )
  ).status,
  503
);
assert.equal(bucketReads, 0, 'Invalid weekly prefix reached R2.');

const get = await weeklyData(dataContext('GET', 'topics.json'));
const body = await get.text();
assert.equal(get.status, 200);
assert.match(body, /SYNTHETIC_WEEKLY_PRIVATE_CANARY_83c12d/);
assert.equal(lastKey, 'weekly/releases/synthetic-v1/topics.json');
assertPrivateHeaders(get);

const head = await weeklyData(dataContext('HEAD', 'topics.json'));
assert.equal(head.status, 200);
assert.equal(await head.text(), '');
assertPrivateHeaders(head);

const malformed = structuredClone(fixture);
malformed.topics[0].private_extension = 'SYNTHETIC_WEEKLY_PRIVATE_CANARY_83c12d';
const malformedResponse = await weeklyData(
  dataContext('GET', 'topics.json', authorization, {
    ...dataEnv,
    READING_DATA: {
      async get() {
        return createObject(JSON.stringify(malformed));
      },
    },
  })
);
assert.equal(malformedResponse.status, 503);
assert.equal(
  (await malformedResponse.text()).includes('SYNTHETIC_WEEKLY_PRIVATE_CANARY_83c12d'),
  false
);
assertPrivateHeaders(malformedResponse);

const oversizedResponse = await weeklyData(
  dataContext('GET', 'topics.json', authorization, {
    ...dataEnv,
    READING_DATA: {
      async get() {
        return createObject(new Uint8Array(2 * 1024 * 1024 + 1));
      },
    },
  })
);
assert.equal(oversizedResponse.status, 503);
assertPrivateHeaders(oversizedResponse);

const afterPrime = await weeklyData(dataContext('GET', 'topics.json', null));
assert.equal(afterPrime.status, 401);
assert.equal((await afterPrime.text()).includes('SYNTHETIC_WEEKLY_PRIVATE_CANARY_83c12d'), false);
assertPrivateHeaders(afterPrime, { challenge: true });

process.stdout.write(
  'Weekly Pages Function checks passed (public pages, private data auth, aliases, R2 allowlist, validation, size limit, and cache-prime denial).\n'
);
