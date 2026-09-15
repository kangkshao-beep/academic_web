import {
  authorizeWeeklyRequest,
  weeklyAuthErrorResponse,
  weeklySecurityHeaders,
  type WeeklyAuthEnv,
} from '../_auth';
import { validateWeeklyTopics } from '../_contract.mjs';

interface WeeklyR2Object {
  body: ReadableStream<Uint8Array>;
}

interface WeeklyR2Bucket {
  get: (key: string) => Promise<WeeklyR2Object | null>;
}

interface WeeklyDataEnv extends WeeklyAuthEnv {
  READING_DATA?: WeeklyR2Bucket;
  READING_WEEKLY_DATA_PREFIX?: string;
}

interface WeeklyDataContext {
  request: Request;
  env?: WeeklyDataEnv;
  params: { filename?: string | string[] };
}

const ALLOWED_FILES = new Set(['topics.json']);
const MAX_WEEKLY_DATA_BYTES = 2 * 1024 * 1024;

function response(status: number, body: BodyInit | null): Response {
  return new Response(body, {
    status,
    headers: weeklySecurityHeaders({ 'Content-Type': 'application/json; charset=UTF-8' }),
  });
}

async function readJson(object: WeeklyR2Object): Promise<unknown> {
  const reader = object.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_WEEKLY_DATA_BYTES) {
        await reader.cancel();
        throw new Error('Weekly data is too large.');
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
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export async function onRequest(context: WeeklyDataContext): Promise<Response> {
  const authorization = await authorizeWeeklyRequest(context.request, context.env);
  if (authorization === 'unavailable') {
    return weeklyAuthErrorResponse(503, 'Weekly topic authentication is unavailable.');
  }
  if (authorization === 'unauthorized') {
    return weeklyAuthErrorResponse(401, 'Authentication required.');
  }
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: weeklySecurityHeaders({
        Allow: 'GET, HEAD',
        'Content-Type': 'application/json; charset=UTF-8',
      }),
    });
  }

  const filename = context.params.filename;
  const prefix = context.env?.READING_WEEKLY_DATA_PREFIX;
  const bucket = context.env?.READING_DATA;
  if (typeof filename !== 'string' || !ALLOWED_FILES.has(filename)) {
    return response(404, JSON.stringify({ error: 'Weekly topic data was not found.' }));
  }
  if (typeof prefix !== 'string' || !/^weekly\/releases\/[A-Za-z0-9._-]+$/.test(prefix) || !bucket) {
    return response(503, JSON.stringify({ error: 'Weekly topic data is unavailable.' }));
  }

  try {
    const object = await bucket.get(`${prefix}/${filename}`);
    if (!object) return response(404, JSON.stringify({ error: 'Weekly topic data was not found.' }));
    const value = validateWeeklyTopics(await readJson(object));
    return response(200, context.request.method === 'HEAD' ? null : JSON.stringify(value));
  } catch {
    return response(503, JSON.stringify({ error: 'Weekly topic data is unavailable.' }));
  }
}
