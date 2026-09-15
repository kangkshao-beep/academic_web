import {
  authorizeReadingRequest,
  readingAuthErrorResponse,
  readingSecurityHeaders,
  secureReadingResponse,
  type ReadingAuthEnv,
} from './_auth';

interface ReadingContext {
  request: Request;
  env?: ReadingAuthEnv;
  next: () => Promise<Response>;
}

export async function onRequest(context: ReadingContext): Promise<Response> {
  if (new URL(context.request.url).pathname === '/reading') {
    return new Response(null, {
      status: 308,
      headers: readingSecurityHeaders({ Location: '/reading/' }),
    });
  }

  const authorization = await authorizeReadingRequest(context.request, context.env);
  if (authorization === 'unavailable') {
    return readingAuthErrorResponse(503, 'Reading authentication is unavailable.');
  }
  if (authorization === 'unauthorized') {
    return readingAuthErrorResponse(401, 'Authentication required.', true);
  }

  try {
    return secureReadingResponse(await context.next());
  } catch {
    return readingAuthErrorResponse(503, 'Reading is temporarily unavailable.');
  }
}
