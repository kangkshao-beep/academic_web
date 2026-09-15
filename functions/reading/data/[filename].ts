import {
  READING_DATA_CACHE_CONTROL,
  READING_ERROR_CACHE_CONTROL,
  readingSecurityHeaders,
} from '../_security';
import { projectReadingPublicFile } from '../_public-data.mjs';

interface ReadingR2Object {
  body: ReadableStream<Uint8Array>;
}

interface ReadingR2Bucket {
  get: (key: string) => Promise<ReadingR2Object | null>;
}

interface ReadingDataEnv {
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
  'Content-Type': 'application/json; charset=UTF-8',
};
const MAX_PUBLIC_DATA_BYTES = 32 * 1024 * 1024;

function response(status: number, body: BodyInit | null): Response {
  const cacheControl = status >= 200 && status < 300
    ? READING_DATA_CACHE_CONTROL
    : READING_ERROR_CACHE_CONTROL;
  return new Response(body, {
    status,
    headers: readingSecurityHeaders(RESPONSE_HEADERS, cacheControl),
  });
}

async function readJson(object: ReadingR2Object): Promise<unknown> {
  const reader = object.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PUBLIC_DATA_BYTES) {
        await reader.cancel();
        throw new Error('Reading data object is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

export async function onRequest(context: ReadingDataContext): Promise<Response> {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: readingSecurityHeaders(
        { ...RESPONSE_HEADERS, Allow: 'GET, HEAD' },
        READING_ERROR_CACHE_CONTROL
      ),
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
    const object = await bucket.get(key);
    if (!object) {
      return response(404, JSON.stringify({ error: 'Reading data was not found.' }));
    }

    const value = await readJson(object);
    const publicValue = projectReadingPublicFile(filename, value, 'public');
    return response(
      200,
      context.request.method === 'HEAD' ? null : JSON.stringify(publicValue)
    );
  } catch {
    return response(503, JSON.stringify({ error: 'Reading data is unavailable.' }));
  }
}
