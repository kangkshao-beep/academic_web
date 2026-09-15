import {
  authorizeReadingRequest,
  readingAuthErrorResponse,
  readingSecurityHeaders,
  type ReadingAuthEnv,
} from '../_auth';

interface ReadingR2Object {
  body: ReadableStream<Uint8Array>;
}

interface ReadingR2Bucket {
  get: (key: string) => Promise<ReadingR2Object | null>;
  head: (key: string) => Promise<unknown | null>;
}

interface ReadingDataEnv extends ReadingAuthEnv {
  READING_DATA?: ReadingR2Bucket;
  READING_DATA_PREFIX?: string;
}

interface ReadingDataContext {
  request: Request;
  env?: ReadingDataEnv;
  params: {
    filename?: string | string[];
  };
}

const ALLOWED_FILES = new Set([
  'library.json',
  'relations.json',
  'threads.json',
  'view_config.json',
]);

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json; charset=UTF-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

function response(status: number, body: BodyInit | null): Response {
  return new Response(body, { status, headers: readingSecurityHeaders(RESPONSE_HEADERS) });
}

export async function onRequest(context: ReadingDataContext): Promise<Response> {
  const authorization = await authorizeReadingRequest(context.request, context.env);
  if (authorization === 'unavailable') {
    return readingAuthErrorResponse(503, 'Reading authentication is unavailable.');
  }
  if (authorization === 'unauthorized') {
    return readingAuthErrorResponse(401, 'Authentication required.', true);
  }

  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: readingSecurityHeaders({ ...RESPONSE_HEADERS, Allow: 'GET, HEAD' }),
    });
  }

  const filename = context.params.filename;
  const prefix = context.env?.READING_DATA_PREFIX;
  const bucket = context.env?.READING_DATA;
  if (typeof filename !== 'string' || !ALLOWED_FILES.has(filename)) {
    return response(404, JSON.stringify({ error: 'Reading data was not found.' }));
  }
  if (typeof prefix !== 'string' || !/^releases\/[A-Za-z0-9._-]+$/.test(prefix) || !bucket) {
    return response(503, JSON.stringify({ error: 'Reading data is unavailable.' }));
  }

  const key = `${prefix}/${filename}`;
  try {
    if (context.request.method === 'HEAD') {
      const metadata = await bucket.head(key);
      return response(metadata ? 200 : 404, null);
    }

    const object = await bucket.get(key);
    return object
      ? response(200, object.body)
      : response(404, JSON.stringify({ error: 'Reading data was not found.' }));
  } catch {
    return response(503, JSON.stringify({ error: 'Reading data is unavailable.' }));
  }
}
