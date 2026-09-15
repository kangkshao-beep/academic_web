export interface WeeklyAuthEnv {
  READING_WEEKLY_BASIC_AUTH_SHA256?: string;
}

export type WeeklyAuthorization = 'authorized' | 'unauthorized' | 'unavailable';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const MAX_AUTHORIZATION_LENGTH = 8192;
const AUTH_REALM = 'Basic realm="Weekly Topics", charset="UTF-8"';
const INVALID_CREDENTIALS_SENTINEL = '\u0000';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "media-src 'self'",
  "manifest-src 'self'",
].join('; ');

const PRIVATE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export function weeklySecurityHeaders(responseHeaders?: HeadersInit): Headers {
  const headers = new Headers(responseHeaders);
  Object.entries(PRIVATE_HEADERS).forEach(([name, value]) => headers.set(name, value));
  const vary = (headers.get('Vary') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!vary.some((value) => value.toLowerCase() === 'authorization')) vary.push('Authorization');
  headers.set('Vary', vary.join(', '));
  for (const name of [
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Methods',
    'WWW-Authenticate',
  ]) {
    headers.delete(name);
  }
  return headers;
}

export function secureWeeklyResponse(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: weeklySecurityHeaders(response.headers),
  });
}

export function weeklyResponse(status: number, body: BodyInit | null, headers?: HeadersInit): Response {
  return new Response(body, { status, headers: weeklySecurityHeaders(headers) });
}

export function weeklyAuthErrorResponse(status: 401 | 503, body: string): Response {
  const headers = weeklySecurityHeaders({ 'Content-Type': 'text/plain; charset=UTF-8' });
  if (status === 401) headers.set('WWW-Authenticate', AUTH_REALM);
  return new Response(body, { status, headers });
}

function configuredHash(env?: WeeklyAuthEnv): Uint8Array | null {
  const value = env?.READING_WEEKLY_BASIC_AUTH_SHA256;
  if (typeof value !== 'string' || !SHA256_HEX_PATTERN.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function decodeBasicCredentials(authorization: string | null): string | null {
  if (!authorization || authorization.length > MAX_AUTHORIZATION_LENGTH) return null;
  const match = /^Basic[ \t]+([^ \t]+)$/i.exec(authorization);
  if (!match) return null;
  const encoded = match[1];
  if (
    encoded.length === 0
    || encoded.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  ) return null;
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const credentials = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return credentials.includes(':') ? credentials : null;
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function authorizeWeeklyRequest(
  request: Request,
  env?: WeeklyAuthEnv
): Promise<WeeklyAuthorization> {
  const expectedHash = configuredHash(env);
  if (!expectedHash) return 'unavailable';
  const credentials = decodeBasicCredentials(request.headers.get('Authorization'));
  try {
    const candidateHash = await sha256(credentials ?? INVALID_CREDENTIALS_SENTINEL);
    return credentials && constantTimeEqual(candidateHash, expectedHash) ? 'authorized' : 'unauthorized';
  } catch {
    return 'unavailable';
  }
}
