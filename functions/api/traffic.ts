interface TrafficStats {
  weekly: number;
  total: number;
}

interface TrafficDatabase {
  prepare: (query: string) => {
    run: () => Promise<unknown>;
    first: <T>() => Promise<T | null>;
  };
}

interface TrafficContext {
  request: Request;
  env: {
    TRAFFIC_DB?: TrafficDatabase;
    TRAFFIC_ENABLED?: string;
  };
}

const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=UTF-8',
  'X-Content-Type-Options': 'nosniff',
};

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      return new URL(origin).origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get('Sec-Fetch-Site');
  return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none';
}

function isLikelyBot(userAgent: string): boolean {
  return /\b(bot|crawler|spider|slurp|archiver|facebookexternalhit|bingpreview)\b/i.test(userAgent);
}

function normalizeCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

async function readTrafficStats(database: TrafficDatabase): Promise<TrafficStats> {
  const result = await database.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN day >= DATE('now', '+8 hours', '-6 days') THEN views ELSE 0 END), 0) AS weekly,
      COALESCE(SUM(views), 0) AS total
    FROM traffic_daily
  `).first<TrafficStats>();

  return {
    weekly: normalizeCount(result?.weekly),
    total: normalizeCount(result?.total),
  };
}

export async function onRequest(context: TrafficContext): Promise<Response> {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  }

  if (!isSameOrigin(request)) {
    return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  }

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'Expected an application/json request.' }, 415);
  }

  if (isLikelyBot(request.headers.get('user-agent') || '')) {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  const database = env.TRAFFIC_DB;
  if (env.TRAFFIC_ENABLED !== 'true' || !database) {
    return json({ error: 'Traffic counter is unavailable.' }, 503);
  }

  try {
    await database.prepare(`
      INSERT INTO traffic_daily (day, views)
      VALUES (DATE('now', '+8 hours'), 1)
      ON CONFLICT(day) DO UPDATE SET views = views + 1
    `).run();

    return json(await readTrafficStats(database));
  } catch (error) {
    console.error('Could not update the traffic counter.', error);
    return json({ error: 'Traffic counter is unavailable.' }, 503);
  }
}
