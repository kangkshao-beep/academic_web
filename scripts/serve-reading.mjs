import { createReadStream, existsSync, statSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { projectReadingPublicBundle } from '../functions/reading/_public-data.mjs';

const projectRoot = process.cwd();
const outputRoot = path.resolve(projectRoot, process.env.READING_SITE_OUTPUT_DIR || 'out');
const configuredDataDir = process.env.READING_DATA_DIR;
const host = process.env.READING_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.READING_PORT || '4173', 10);
const dataFiles = new Set(['library.json', 'relations.json', 'threads.json', 'view_config.json']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const PAGE_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const DATA_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=60';
const ERROR_CACHE_CONTROL = 'no-store';

if (!configuredDataDir) {
  throw new Error('READING_DATA_DIR is required.');
}
if (!LOOPBACK_HOSTS.has(host)) {
  throw new Error('READING_HOST must be a loopback host (127.0.0.1, localhost, or ::1).');
}
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('READING_PORT must be an integer from 0 to 65535.');
}

const dataRoot = path.resolve(configuredDataDir);
await access(path.join(outputRoot, 'reading', 'index.html'));
const sourceFiles = Object.fromEntries(await Promise.all(Array.from(dataFiles, async (filename) => [
  filename,
  JSON.parse(await readFile(path.join(dataRoot, filename), 'utf8')),
])));
const sourceVisibility = sourceFiles['library.json']?.visibility;
if (
  (sourceVisibility !== 'private' && sourceVisibility !== 'public')
  || Object.values(sourceFiles).some((source) => source?.visibility !== sourceVisibility)
) {
  throw new Error('Reading source visibility is invalid or inconsistent.');
}
const publicBundle = projectReadingPublicBundle(sourceFiles, sourceVisibility);
const publicData = new Map(Object.entries(publicBundle).map(([filename, value]) => [
  filename,
  Buffer.from(JSON.stringify(value)),
]));

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; media-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

function isReadingPath(pathname) {
  return pathname === '/reading' || pathname.startsWith('/reading/');
}

function readingHeaders(cacheControl, headers = {}) {
  return { ...securityHeaders, 'Cache-Control': cacheControl, ...headers };
}

function send(request, response, status, headers = {}, body = '') {
  response.writeHead(status, headers);
  if (request.method === 'HEAD' || body === null) response.end();
  else response.end(body);
}

function resolvePublicFile(pathname) {
  let normalized = pathname;
  if (normalized.endsWith('/')) normalized += 'index.html';
  const candidate = path.resolve(outputRoot, `.${normalized}`);
  if (candidate !== outputRoot && !candidate.startsWith(`${outputRoot}${path.sep}`)) return null;
  if (!existsSync(candidate)) return null;
  const stats = statSync(candidate);
  if (stats.isDirectory()) {
    const index = path.join(candidate, 'index.html');
    return existsSync(index) ? index : null;
  }
  return stats.isFile() ? candidate : null;
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    const urlHost = host.includes(':') ? `[${host}]` : host;
    pathname = decodeURIComponent(new URL(request.url || '/', `http://${urlHost}`).pathname);
  } catch {
    send(request, response, 400, { 'Cache-Control': ERROR_CACHE_CONTROL }, 'Bad request.');
    return;
  }

  const readingRequest = isReadingPath(pathname);
  if (pathname === '/api/traffic' && request.method === 'POST') {
    request.resume();
    send(
      request,
      response,
      200,
      { 'Cache-Control': ERROR_CACHE_CONTROL, 'Content-Type': 'application/json; charset=utf-8' },
      JSON.stringify({ weekly: 0, total: 0 })
    );
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    request.resume();
    const headers = readingRequest
      ? readingHeaders(ERROR_CACHE_CONTROL, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' })
      : { Allow: 'GET, HEAD', 'Cache-Control': ERROR_CACHE_CONTROL };
    send(request, response, 405, headers, 'Method not allowed.');
    return;
  }

  if (pathname === '/reading') {
    send(request, response, 308, readingHeaders(PAGE_CACHE_CONTROL, { Location: '/reading/' }));
    return;
  }

  if (pathname === '/reading/weekly' || pathname.startsWith('/reading/weekly/')) {
    send(
      request,
      response,
      404,
      readingHeaders(ERROR_CACHE_CONTROL, { 'Content-Type': 'text/plain; charset=utf-8' }),
      'Not found.'
    );
    return;
  }

  const dataMatch = /^\/reading\/data\/([^/]+)$/.exec(pathname);
  if (dataMatch) {
    const filename = dataMatch[1];
    if (!dataFiles.has(filename)) {
      send(
        request,
        response,
        404,
        readingHeaders(ERROR_CACHE_CONTROL, { 'Content-Type': 'application/json; charset=utf-8' }),
        JSON.stringify({ error: 'Reading data was not found.' })
      );
      return;
    }
    try {
      const body = publicData.get(filename);
      if (!body) throw new Error('Missing Reading data.');
      send(
        request,
        response,
        200,
        readingHeaders(DATA_CACHE_CONTROL, { 'Content-Type': 'application/json; charset=utf-8' }),
        body
      );
    } catch {
      send(
        request,
        response,
        503,
        readingHeaders(ERROR_CACHE_CONTROL, { 'Content-Type': 'application/json; charset=utf-8' }),
        JSON.stringify({ error: 'Reading data is unavailable.' })
      );
    }
    return;
  }

  const file = resolvePublicFile(pathname);
  if (!file) {
    const headers = readingRequest
      ? readingHeaders(ERROR_CACHE_CONTROL, { 'Content-Type': 'text/plain; charset=utf-8' })
      : { 'Cache-Control': ERROR_CACHE_CONTROL };
    send(request, response, 404, headers, 'Not found.');
    return;
  }

  const headers = {
    ...(readingRequest
      ? readingHeaders(PAGE_CACHE_CONTROL)
      : { 'Cache-Control': 'public, max-age=0, must-revalidate' }),
    'Content-Type': mimeTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
  };
  response.writeHead(200, headers);
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  const address = server.address();
  const listeningPort = typeof address === 'object' && address ? address.port : port;
  process.stdout.write(`Reading test server listening on http://${host}:${listeningPort}\n`);
});

function close() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
