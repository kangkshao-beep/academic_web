export interface ReadingAuthEnv {
  READING_BASIC_AUTH_SHA256?: string;
}

export type ReadingAuthorization = 'authorized' | 'unauthorized' | 'unavailable';

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const MAX_AUTHORIZATION_LENGTH = 8192;
const AUTH_REALM = 'Basic realm="Reading", charset="UTF-8"';
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

const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
};

export function readingSecurityHeaders(responseHeaders?: HeadersInit): Headers {
  const headers = new Headers(responseHeaders);

  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => {
    headers.set(name, value);
  });

  // Reading data is same-origin only. Remove any permissive headers inherited
  // from a downstream or static Pages response.
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  headers.delete('Access-Control-Allow-Headers');
  headers.delete('Access-Control-Allow-Methods');

  return headers;
}

export function secureReadingResponse(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: readingSecurityHeaders(response.headers),
  });
}

export function readingAuthErrorResponse(
  status: 401 | 503,
  body: string,
  challenge = false
): Response {
  const headers = readingSecurityHeaders({
    'Content-Type': 'text/plain; charset=UTF-8',
  });

  if (challenge) {
    headers.set('WWW-Authenticate', AUTH_REALM);
  }

  return new Response(body, { status, headers });
}

function configuredHash(env?: ReadingAuthEnv): Uint8Array | null {
  const value = env?.READING_BASIC_AUTH_SHA256;
  if (typeof value !== 'string' || !SHA256_HEX_PATTERN.test(value)) {
    return null;
  }

  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function decodeBasicCredentials(authorization: string | null): string | null {
  if (!authorization || authorization.length > MAX_AUTHORIZATION_LENGTH) {
    return null;
  }

  const match = /^Basic[ \t]+([^ \t]+)$/i.exec(authorization);
  if (!match) {
    return null;
  }

  const encoded = match[1];
  if (
    encoded.length === 0
    || encoded.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  ) {
    return null;
  }

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
  const input = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return new Uint8Array(digest);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function authorizeReadingRequest(
  request: Request,
  env?: ReadingAuthEnv
): Promise<ReadingAuthorization> {
  const expectedHash = configuredHash(env);
  if (!expectedHash) {
    return 'unavailable';
  }

  const credentials = decodeBasicCredentials(request.headers.get('Authorization'));
  try {
    // Hash a fixed sentinel for malformed or missing credentials as well, so
    // every configured request reaches the same comparison path.
    const candidateHash = await sha256(credentials ?? INVALID_CREDENTIALS_SENTINEL);
    if (!credentials || !constantTimeEqual(candidateHash, expectedHash)) {
      return 'unauthorized';
    }
    return 'authorized';
  } catch {
    return 'unavailable';
  }
}
