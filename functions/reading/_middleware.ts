import {
  READING_DATA_CACHE_CONTROL,
  READING_ERROR_CACHE_CONTROL,
  READING_PAGE_CACHE_CONTROL,
  readingErrorResponse,
  readingSecurityHeaders,
  secureReadingResponse,
} from './_security';

interface ReadingContext {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(context: ReadingContext): Promise<Response> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(context.request.url).pathname);
  } catch {
    return readingErrorResponse(404, 'Not found.');
  }
  if (
    pathname === '/reading/weekly'
    || pathname.startsWith('/reading/weekly/')
    || pathname === '/reading/data/weekly.json'
  ) {
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
