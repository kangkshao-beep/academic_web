const DATA_FILES = [
  'library.json',
  'relations.json',
  'threads.json',
  'view_config.json',
];
const DISALLOWED_PATHS = [
  '/reading/data/export.json',
  '/reading/data/thesis_reference_lookup.json',
  '/reading/data/weekly.json',
  '/reading/weekly',
  '/reading/weekly/',
];
const PUBLIC_PATHS = ['/', '/publications/', '/learning/', '/search-index.json'];
const MAX_BODY_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const CANARY = process.env.READING_TEST_CANARY || '';

const ROOT_KEYS = {
  'library.json': ['schema_version', 'visibility', 'papers'],
  'relations.json': ['schema_version', 'visibility', 'edges'],
  'threads.json': ['schema_version', 'visibility', 'threads'],
  'view_config.json': ['schema_version', 'visibility', 'default_view', 'graph'],
};
const PAPER_KEYS = [
  'id', 'title', 'authors', 'authors_complete', 'collaboration', 'year', 'preprint_year',
  'journal', 'arxiv', 'doi', 'inspire', 'entry_type', 'role', 'topics', 'processes',
  'priority', 'priority_basis', 'reading_status', 'curation_status', 'origin',
  'bibliography_ref', 'raw_thesis_citation', 'why_it_matters', 'research_connection',
  'annotation_author', 'source_in_thesis', 'verification', 'personal_notes', 'idea_hooks',
];
const LOCATOR_KEYS = ['chapter', 'section', 'printed_pages', 'pdf_pages', 'purpose'];
const VERIFICATION_KEYS = ['identity_status', 'checked_on', 'content_basis', 'sources', 'notes'];
const VERIFICATION_SOURCE_KEYS = ['kind', 'url', 'locator'];
const EDGE_KEYS = [
  'id', 'source', 'target', 'relation', 'layer', 'directed', 'note', 'evidence',
  'confidence', 'status',
];
const PRIMARY_EVIDENCE_KEYS = ['kind', 'url', 'locator', 'checked_on'];
const THESIS_EVIDENCE_KEYS = ['kind', 'chapter', 'section', 'printed_pages', 'pdf_pages'];
const THREAD_KEYS = [
  'id', 'title', 'annotation_author', 'status', 'summary', 'thesis_chapters', 'stages',
  'reading_question',
];
const STAGE_KEYS = ['label', 'papers', 'narrative'];
const GRAPH_KEYS = [
  'eligible_priority_min', 'initial_focus_ids', 'default_layers',
  'curatorial_layer_default', 'default_hops', 'max_expansion_hops',
];
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'visibility',
  'source_document',
  'body_scope',
  'bibliography_lookup',
  'document_id',
  'question_status',
  'generated_on',
  'curation_notice',
  'direction_rule',
  'epistemic_warning',
  'hypothesis_edges',
  'hypothesis_layer_default',
  'initial_node_limit',
  'public_seed_export_enabled',
  'weekly_agent_enabled',
  'web_editing_enabled',
]);

let failureCount = 0;

function report(result, origin, method, pathname, status) {
  process.stdout.write(
    `origin=${JSON.stringify(origin || '-')} path=${JSON.stringify(`${method || '-'} ${pathname || '-'}`)} status=${status} ${result}\n`
  );
  if (result !== 'PASS') failureCount += 1;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireCondition(condition) {
  if (!condition) throw new Error('check failed');
}

function requireExactKeys(value, expected) {
  requireCondition(isRecord(value));
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  requireCondition(actual.length === required.length);
  requireCondition(actual.every((key, index) => key === required[index]));
}

function requireNoForbiddenNestedKeys(value, isRoot = true) {
  if (Array.isArray(value)) {
    for (const item of value) requireNoForbiddenNestedKeys(item, false);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    requireCondition(isRoot || !FORBIDDEN_PUBLIC_KEYS.has(key));
    requireNoForbiddenNestedKeys(nested, false);
  }
}

function normalizeOrigin(input) {
  const url = new URL(input);
  requireCondition(url.username === '' && url.password === '');
  requireCondition(url.pathname === '/' && url.search === '' && url.hash === '');
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
  requireCondition(url.protocol === 'https:' || (url.protocol === 'http:' && loopbackHosts.has(url.hostname)));
  return url.origin;
}

async function readBody(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('check failed');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function headerTokens(headers, name) {
  return (headers.get(name) || '')
    .toLowerCase()
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function contentSecurityPolicyDirectives(value) {
  const directives = new Map();
  for (const item of value.split(';')) {
    const [name, ...tokens] = item.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), tokens);
  }
  return directives;
}

function assertReadingSecurityHeaders(response, cacheKind) {
  const cacheControl = headerTokens(response.headers, 'cache-control');
  const contentSecurityPolicy = contentSecurityPolicyDirectives(
    response.headers.get('content-security-policy') || ''
  );

  if (cacheKind === 'page') {
    requireCondition(cacheControl.includes('public'));
    requireCondition(cacheControl.includes('max-age=0'));
    requireCondition(cacheControl.includes('must-revalidate'));
  } else if (cacheKind === 'data') {
    requireCondition(cacheControl.includes('public'));
    requireCondition(cacheControl.includes('max-age=60'));
    requireCondition(cacheControl.includes('s-maxage=300'));
    requireCondition(cacheControl.includes('stale-while-revalidate=60'));
  } else {
    requireCondition(cacheControl.includes('no-store'));
  }

  requireCondition(!response.headers.has('x-robots-tag'));
  requireCondition(!response.headers.has('www-authenticate'));
  requireCondition(response.headers.get('referrer-policy')?.toLowerCase() === 'no-referrer');
  requireCondition(response.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff');
  requireCondition(response.headers.get('x-frame-options')?.toUpperCase() === 'DENY');
  requireCondition(contentSecurityPolicy.get('default-src')?.includes("'self'"));
  requireCondition(contentSecurityPolicy.get('object-src')?.includes("'none'"));
  requireCondition(contentSecurityPolicy.get('frame-ancestors')?.includes("'none'"));
  requireCondition(!response.headers.has('access-control-allow-origin'));
}

function parseReadingJson(filename, body) {
  const value = JSON.parse(body);
  requireExactKeys(value, ROOT_KEYS[filename]);
  requireCondition(value.schema_version === '1.0.0');
  requireCondition(value.visibility === 'public');
  requireNoForbiddenNestedKeys(value);

  if (filename === 'library.json') {
    requireCondition(Array.isArray(value.papers) && value.papers.length > 0);
    for (const paper of value.papers) {
      requireExactKeys(paper, PAPER_KEYS);
      requireCondition(Array.isArray(paper.source_in_thesis));
      for (const locator of paper.source_in_thesis) requireExactKeys(locator, LOCATOR_KEYS);
      requireExactKeys(paper.verification, VERIFICATION_KEYS);
      requireCondition(Array.isArray(paper.verification.sources));
      for (const source of paper.verification.sources) {
        requireExactKeys(source, VERIFICATION_SOURCE_KEYS);
      }
    }
    if (CANARY) requireCondition(body.includes(CANARY));
  } else if (filename === 'relations.json') {
    requireCondition(Array.isArray(value.edges));
    for (const edge of value.edges) {
      requireExactKeys(edge, EDGE_KEYS);
      requireCondition(Array.isArray(edge.evidence) && edge.evidence.length > 0);
      for (const evidence of edge.evidence) {
        if (evidence?.kind === 'primary_source') {
          requireExactKeys(evidence, PRIMARY_EVIDENCE_KEYS);
        } else {
          requireCondition(evidence?.kind === 'thesis_context');
          requireExactKeys(evidence, THESIS_EVIDENCE_KEYS);
        }
      }
    }
  } else if (filename === 'threads.json') {
    requireCondition(Array.isArray(value.threads));
    for (const thread of value.threads) {
      requireExactKeys(thread, THREAD_KEYS);
      requireCondition(Array.isArray(thread.stages) && thread.stages.length > 0);
      for (const stage of thread.stages) requireExactKeys(stage, STAGE_KEYS);
    }
  } else {
    requireCondition(['library', 'map', 'threads'].includes(value.default_view));
    requireExactKeys(value.graph, GRAPH_KEYS);
  }
}

async function request(origin, pathname, { method = 'GET' } = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await readBody(response);
  return { response, body };
}

async function check(origin, pathname, options, validate) {
  const method = options?.method || 'GET';
  let status = 'NETWORK';
  try {
    const result = await request(origin, pathname, options);
    status = result.response.status;
    validate(result.response, result.body);
    report('PASS', origin, method, pathname, status);
    return result;
  } catch {
    report('FAIL', origin, method, pathname, status);
    return null;
  }
}

function assertSafeReadingRedirect(response, origin, expectedPath) {
  const location = response.headers.get('location');
  requireCondition(location !== null);
  const target = new URL(location, origin);
  requireCondition(target.origin === origin);
  requireCondition(target.pathname === expectedPath);
  requireCondition(target.search === '' && target.hash === '');
}

async function verifyOrigin(origin) {
  for (const method of ['GET', 'HEAD']) {
    await check(origin, '/reading', { method }, (response, body) => {
      requireCondition(response.status === 308);
      assertReadingSecurityHeaders(response, 'page');
      requireCondition(body === '');
      assertSafeReadingRedirect(response, origin, '/reading/');
    });
  }

  for (const method of ['GET', 'HEAD']) {
    await check(origin, '/reading/', { method }, (response, body) => {
      requireCondition(response.status === 200);
      assertReadingSecurityHeaders(response, 'page');
      requireCondition((response.headers.get('content-type') || '').toLowerCase().includes('text/html'));
      if (method === 'HEAD') requireCondition(body === '');
    });
  }

  for (const pathname of ['/reading/index.html', '/reading/index.txt']) {
    for (const method of ['GET', 'HEAD']) {
      await check(origin, pathname, { method }, (response, body) => {
        requireCondition(response.status === 200 || [301, 302, 307, 308].includes(response.status));
        assertReadingSecurityHeaders(response, 'page');
        if (response.status >= 300) assertSafeReadingRedirect(response, origin, '/reading/');
        if (method === 'HEAD') requireCondition(body === '');
      });
    }
  }

  for (const filename of DATA_FILES) {
    const pathname = `/reading/data/${filename}`;
    await check(origin, pathname, {}, (response, body) => {
      requireCondition(response.status === 200);
      assertReadingSecurityHeaders(response, 'data');
      requireCondition((response.headers.get('content-type') || '').toLowerCase().includes('application/json'));
      parseReadingJson(filename, body);
    });
    await check(origin, pathname, { method: 'HEAD' }, (response, body) => {
      requireCondition(response.status === 200);
      assertReadingSecurityHeaders(response, 'data');
      requireCondition(body === '');
    });
  }

  for (const pathname of DISALLOWED_PATHS) {
    for (const method of ['GET', 'HEAD']) {
      await check(origin, pathname, { method }, (response, body) => {
        requireCondition(response.status === 404);
        assertReadingSecurityHeaders(response, 'error');
        requireCondition(!CANARY || !body.includes(CANARY));
        if (method === 'HEAD') requireCondition(body === '');
      });
    }
  }

  for (const pathname of ['/reading', '/reading/', '/reading/data/library.json']) {
    await check(origin, pathname, { method: 'POST' }, (response) => {
      requireCondition(response.status === 405);
      requireCondition(response.headers.get('allow') === 'GET, HEAD');
      assertReadingSecurityHeaders(response, 'error');
    });
  }

  for (const pathname of PUBLIC_PATHS) {
    await check(origin, pathname, {}, (response, body) => {
      requireCondition(response.status === 200);
      requireCondition(!response.headers.has('www-authenticate'));
      requireCondition(!CANARY || !body.includes(CANARY));
    });
  }
}

let origins;
try {
  requireCondition(process.argv.length > 2);
  requireCondition(CANARY.length <= 1024 && !/[\r\n\0]/.test(CANARY));
  origins = [...new Set(process.argv.slice(2).map(normalizeOrigin))];
  requireCondition(origins.length > 0);
} catch {
  report('FAIL', '-', '-', '-', 'CONFIG');
  process.exitCode = 1;
}

if (origins) {
  delete process.env.READING_TEST_CANARY;
  for (const origin of origins) await verifyOrigin(origin);
  if (failureCount > 0) process.exitCode = 1;
}
