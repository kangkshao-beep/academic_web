import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const projectRoot = process.cwd();
const outputRoot = path.resolve(projectRoot, process.env.READING_SITE_OUTPUT_DIR || 'out');
const configuredDataDir = process.env.READING_PRIVATE_DATA_DIR;
const credentialHash = (process.env.READING_BASIC_AUTH_SHA256 || '').trim().toLowerCase();
const host = process.env.READING_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.READING_PORT || '4173', 10);
const dataFiles = new Set(['library.json', 'relations.json', 'threads.json', 'view_config.json']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

if (!configuredDataDir) {
  throw new Error('READING_PRIVATE_DATA_DIR is required.');
}
if (!/^[a-f0-9]{64}$/.test(credentialHash)) {
  throw new Error('READING_BASIC_AUTH_SHA256 must be a lowercase SHA-256 hex digest.');
}
if (!LOOPBACK_HOSTS.has(host)) {
  throw new Error('READING_HOST must be a loopback host (127.0.0.1, localhost, or ::1).');
}
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('READING_PORT must be an integer from 0 to 65535.');
}

const dataRoot = path.resolve(configuredDataDir);
await access(path.join(outputRoot, 'reading', 'index.html'));
await Promise.all(Array.from(dataFiles, (filename) => access(path.join(dataRoot, filename))));

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
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

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest();
}

function isAuthorized(request) {
  const authorization = request.headers.authorization || '';
  const match = /^Basic[ \t]+([^ \t]+)$/i.exec(authorization);
  if (!match) return false;

  const encoded = match[1];
  if (
    encoded.length === 0
    || encoded.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  ) return false;

  try {
    const supplied = hashBytes(Buffer.from(encoded, 'base64'));
    const expected = Buffer.from(credentialHash, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
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
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(request, response, 405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }, 'Method not allowed.');
    return;
  }

  let pathname;
  try {
    const urlHost = host.includes(':') ? `[${host}]` : host;
    pathname = decodeURIComponent(new URL(request.url || '/', `http://${urlHost}`).pathname);
  } catch {
    send(request, response, 400, { 'Cache-Control': 'no-store' }, 'Bad request.');
    return;
  }

  if (pathname === '/reading') {
    send(request, response, 308, { ...privateHeaders, Location: '/reading/' });
    return;
  }

  const readingRequest = isReadingPath(pathname);
  if (readingRequest && !isAuthorized(request)) {
    send(request, response, 401, {
      ...privateHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="Private Reading", charset="UTF-8"',
    }, 'Authentication required.');
    return;
  }

  const dataMatch = /^\/reading\/data\/([^/]+)$/.exec(pathname);
  if (dataMatch) {
    const filename = dataMatch[1];
    if (!dataFiles.has(filename)) {
      send(request, response, 404, { ...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found.');
      return;
    }
    try {
      const body = await readFile(path.join(dataRoot, filename));
      send(request, response, 200, { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' }, body);
    } catch {
      send(request, response, 503, { ...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8' }, 'Private data unavailable.');
    }
    return;
  }

  const file = resolvePublicFile(pathname);
  if (!file) {
    send(request, response, 404, readingRequest ? privateHeaders : { 'Cache-Control': 'no-store' }, 'Not found.');
    return;
  }

  const headers = {
    ...(readingRequest ? privateHeaders : { 'Cache-Control': 'public, max-age=0, must-revalidate' }),
    'Content-Type': mimeTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
  };
  response.writeHead(200, headers);
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  const address = server.address();
  const listeningPort = typeof address === 'object' && address ? address.port : port;
  process.stdout.write(`Private Reading server listening on http://${host}:${listeningPort}\n`);
});

function close() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
