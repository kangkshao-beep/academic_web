export const READING_PAGE_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
export const READING_DATA_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=60';
export const READING_ERROR_CACHE_CONTROL = 'no-store';

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
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
};

export function readingSecurityHeaders(
  responseHeaders?: HeadersInit,
  cacheControl = READING_PAGE_CACHE_CONTROL
): Headers {
  const headers = new Headers(responseHeaders);

  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => {
    headers.set(name, value);
  });
  headers.set('Cache-Control', cacheControl);

  // Reading is public, but its runtime data remains same-origin only.
  for (const name of [
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Methods',
    'WWW-Authenticate',
    'X-Robots-Tag',
  ]) {
    headers.delete(name);
  }

  return headers;
}

export function secureReadingResponse(response: Response, cacheControl: string): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: readingSecurityHeaders(response.headers, cacheControl),
  });
}

export function readingErrorResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: readingSecurityHeaders(
      { 'Content-Type': 'text/plain; charset=UTF-8' },
      READING_ERROR_CACHE_CONTROL
    ),
  });
}
