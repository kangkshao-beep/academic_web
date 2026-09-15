import {
  READING_DATA_CACHE_CONTROL,
  READING_ERROR_CACHE_CONTROL,
  READING_PAGE_CACHE_CONTROL,
  readingErrorResponse,
  readingSecurityHeaders,
  secureReadingResponse,
} from './_security';
import {
  authorizeWeeklyRequest,
  secureWeeklyResponse,
  weeklyAuthErrorResponse,
  weeklyResponse,
  type WeeklyAuthEnv,
} from './weekly/_auth';

interface ReadingContext {
  request: Request;
  env?: WeeklyAuthEnv;
  next: () => Promise<Response>;
}

export async function onRequest(context: ReadingContext): Promise<Response> {
  let pathname: string;
  try {
    pathname = new URL(context.request.url).pathname;
  } catch {
    return readingErrorResponse(404, 'Not found.');
  }

  if (pathname.includes('%') || pathname.includes('\\') || /\/{2,}/.test(pathname)) {
    return readingErrorResponse(404, 'Not found.');
  }

  if (pathname === '/reading/weekly') {
    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
      return weeklyResponse(405, 'Method not allowed.', {
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=UTF-8',
      });
    }
    return weeklyResponse(308, null, { Location: '/reading/weekly/' });
  }

  if (pathname === '/reading/weekly.html' || pathname === '/reading/weekly.txt') {
    return weeklyResponse(404, 'Not found.', { 'Content-Type': 'text/plain; charset=UTF-8' });
  }

  if (pathname.startsWith('/reading/weekly/')) {
    const authorization = await authorizeWeeklyRequest(context.request, context.env);
    if (authorization === 'unavailable') {
      return weeklyAuthErrorResponse(503, 'Weekly topic authentication is unavailable.');
    }
    if (authorization === 'unauthorized') {
      return weeklyAuthErrorResponse(401, 'Authentication required.');
    }
    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
      return weeklyResponse(405, 'Method not allowed.', {
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=UTF-8',
      });
    }
    try {
      return secureWeeklyResponse(await context.next());
    } catch {
      return weeklyResponse(503, 'Weekly topics are temporarily unavailable.', {
        'Content-Type': 'text/plain; charset=UTF-8',
      });
    }
  }

  if (pathname === '/reading/data/weekly.json') {
    return readingErrorResponse(404, 'Not found.');
  }

  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return new Response('Method not allowed.', {
      status: 405,
      headers: readingSecurityHeaders(
        { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=UTF-8' },
        READING_ERROR_CACHE_CONTROL
      ),
    });
  }

  if (pathname === '/reading') {
    return new Response(null, {
      status: 308,
      headers: readingSecurityHeaders({ Location: '/reading/' }, READING_PAGE_CACHE_CONTROL),
    });
  }

  try {
    const response = await context.next();
    const cacheControl = response.status >= 200 && response.status < 400
      ? (pathname.startsWith('/reading/data/') ? READING_DATA_CACHE_CONTROL : READING_PAGE_CACHE_CONTROL)
      : READING_ERROR_CACHE_CONTROL;
    return secureReadingResponse(response, cacheControl);
  } catch {
    return readingErrorResponse(503, 'Reading is temporarily unavailable.');
  }
}
