import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, 'out');
const publicGeneratedBaselinePaths = new Set([
  'out/index.html',
  'out/index.txt',
  'out/cv/index.html',
  'out/cv/index.txt',
  'out/publications/index.html',
  'out/publications/index.txt',
  'out/search-index.json',
]);
const privateDataDir = process.env.READING_PRIVATE_DATA_DIR
  ? path.resolve(process.env.READING_PRIVATE_DATA_DIR)
  : null;
const textExtensions = new Set([
  '.bib',
  '.conf',
  '.css',
  '.csv',
  '.env',
  '.html',
  '.ini',
  '.js',
  '.json',
  '.map',
  '.md',
  '.mdx',
  '.mjs',
  '.rst',
  '.svg',
  '.tex',
  '.toml',
  '.ts',
  '.tsv',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

async function walk(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function usesShortFingerprint(field) {
  return (
    (field.startsWith('library.papers[') && field.endsWith('.id'))
    || field === 'library.source_document.id'
    || field === 'library.source_document.sha256'
    || field.endsWith('.filename')
    || field.includes('.initial_focus_ids[')
    || (field.includes('.stages[') && field.includes('.papers['))
    || field.endsWith('.source')
    || field.endsWith('.target')
    || field.endsWith('.document_id')
    || /\.(arxiv|doi|inspire)$/.test(field)
  );
}

function addPrivateString(output, value, field) {
  if (typeof value !== 'string') return;
  const normalized = value.trim();
  const minimumLength = usesShortFingerprint(field) ? 4 : 12;
  if (normalized.length < minimumLength) return;
  const fields = output.get(normalized) || [];
  fields.push(field);
  output.set(normalized, fields);
}

function collectNestedPrivateStrings(output, value, field) {
  if (typeof value === 'string') {
    addPrivateString(output, value, field);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectNestedPrivateStrings(output, item, `${field}.items[${index}]`);
    });
    return;
  }
  if (!value || typeof value !== 'object') return;

  Object.entries(value).forEach(([key, item], index) => {
    void key;
    // Use stable numeric paths in diagnostics so private object keys are never
    // repeated in scanner output. Generic schema keys are intentionally not
    // fingerprints; the high-signal values nested beneath them still are.
    collectNestedPrivateStrings(output, item, `${field}.values[${index}]`);
  });
}

function collectPrivateStrings(filename, value, output) {
  if (filename === 'library.json') {
    addPrivateString(output, value.curation_notice, 'library.curation_notice');
    const sourceDocument = value.source_document || {};
    addPrivateString(output, sourceDocument.id, 'library.source_document.id');
    addPrivateString(output, sourceDocument.filename, 'library.source_document.filename');
    addPrivateString(output, sourceDocument.sha256, 'library.source_document.sha256');
    addPrivateString(output, sourceDocument.page_numbering, 'library.source_document.page_numbering');
    collectNestedPrivateStrings(output, sourceDocument.body_scope, 'library.source_document.body_scope');
    collectNestedPrivateStrings(
      output,
      sourceDocument.bibliography_lookup,
      'library.source_document.bibliography_lookup'
    );
    const knownSourceDocumentKeys = new Set([
      'id',
      'filename',
      'sha256',
      'body_scope',
      'bibliography_lookup',
      'page_numbering',
    ]);
    Object.entries(sourceDocument)
      .filter(([key]) => !knownSourceDocumentKeys.has(key))
      .forEach(([key, item], index) => {
        void key;
        collectNestedPrivateStrings(
          output,
          item,
          `library.source_document.extensions[${index}].value`
        );
      });
    for (const [paperIndex, paper] of (value.papers || []).entries()) {
      const paperPath = `library.papers[${paperIndex}]`;
      addPrivateString(output, paper.id, `${paperPath}.id`);
      addPrivateString(output, paper.title, `${paperPath}.title`);
      (paper.authors || []).forEach((item, index) => addPrivateString(output, item, `${paperPath}.authors[${index}]`));
      addPrivateString(output, paper.collaboration, `${paperPath}.collaboration`);
      addPrivateString(output, paper.journal, `${paperPath}.journal`);
      addPrivateString(output, paper.arxiv, `${paperPath}.arxiv`);
      addPrivateString(output, paper.doi, `${paperPath}.doi`);
      addPrivateString(output, paper.inspire, `${paperPath}.inspire`);
      addPrivateString(output, paper.raw_thesis_citation, `${paperPath}.raw_thesis_citation`);
      addPrivateString(output, paper.why_it_matters, `${paperPath}.why_it_matters`);
      addPrivateString(output, paper.research_connection, `${paperPath}.research_connection`);
      addPrivateString(output, paper.personal_notes, `${paperPath}.personal_notes`);
      (paper.idea_hooks || []).forEach((item, index) => addPrivateString(output, item, `${paperPath}.idea_hooks[${index}]`));
      (paper.verification?.notes || []).forEach((item, index) => addPrivateString(output, item, `${paperPath}.verification.notes[${index}]`));
      addPrivateString(output, paper.verification?.content_basis, `${paperPath}.verification.content_basis`);
      (paper.verification?.sources || []).forEach((source, index) => {
        addPrivateString(output, source.url, `${paperPath}.verification.sources[${index}].url`);
        addPrivateString(output, source.locator, `${paperPath}.verification.sources[${index}].locator`);
      });
      (paper.source_in_thesis || []).forEach((locator, index) => {
        addPrivateString(output, locator.section, `${paperPath}.source_in_thesis[${index}].section`);
        addPrivateString(output, locator.purpose, `${paperPath}.source_in_thesis[${index}].purpose`);
      });
    }
  } else if (filename === 'relations.json') {
    addPrivateString(output, value.direction_rule, 'relations.direction_rule');
    addPrivateString(output, value.epistemic_warning, 'relations.epistemic_warning');
    for (const [edgeIndex, edge] of (value.edges || []).entries()) {
      addPrivateString(output, edge.id, `relations.edges[${edgeIndex}].id`);
      addPrivateString(output, edge.source, `relations.edges[${edgeIndex}].source`);
      addPrivateString(output, edge.target, `relations.edges[${edgeIndex}].target`);
      addPrivateString(output, edge.note, `relations.edges[${edgeIndex}].note`);
      (edge.evidence || []).forEach((evidence, evidenceIndex) => {
        addPrivateString(output, evidence.url, `relations.edges[${edgeIndex}].evidence[${evidenceIndex}].url`);
        addPrivateString(output, evidence.locator, `relations.edges[${edgeIndex}].evidence[${evidenceIndex}].locator`);
        addPrivateString(output, evidence.document_id, `relations.edges[${edgeIndex}].evidence[${evidenceIndex}].document_id`);
        addPrivateString(output, evidence.section, `relations.edges[${edgeIndex}].evidence[${evidenceIndex}].section`);
      });
    }
  } else if (filename === 'threads.json') {
    for (const [threadIndex, thread] of (value.threads || []).entries()) {
      const threadPath = `threads.threads[${threadIndex}]`;
      addPrivateString(output, thread.id, `${threadPath}.id`);
      addPrivateString(output, thread.title, `${threadPath}.title`);
      addPrivateString(output, thread.summary, `${threadPath}.summary`);
      addPrivateString(output, thread.reading_question, `${threadPath}.reading_question`);
      (thread.stages || []).forEach((stage, stageIndex) => {
        addPrivateString(output, stage.label, `${threadPath}.stages[${stageIndex}].label`);
        addPrivateString(output, stage.narrative, `${threadPath}.stages[${stageIndex}].narrative`);
        (stage.papers || []).forEach((item, index) => {
          addPrivateString(output, item, `${threadPath}.stages[${stageIndex}].papers[${index}]`);
        });
      });
    }
  } else if (filename === 'view_config.json') {
    (value.graph?.initial_focus_ids || []).forEach((item, index) => addPrivateString(output, item, `view_config.graph.initial_focus_ids[${index}]`));
  }
}

function isPrivatePathCandidate(filename) {
  const normalized = filename.toLowerCase();
  return (
    normalized.includes('private_seed/')
    || normalized.includes('reading_v1_handoff/')
    || normalized.startsWith('public/reading/data/')
    || normalized.endsWith('thesis_reference_lookup.json')
  );
}

const failures = [];
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: projectRoot })
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

for (const filename of tracked) {
  if (isPrivatePathCandidate(filename)) {
    failures.push(`Tracked private-path candidate: ${filename}`);
  }
}

const outputAllFiles = await walk(outputRoot);
for (const filename of outputAllFiles) {
  const relative = path.relative(projectRoot, filename);
  if (isPrivatePathCandidate(relative)) {
    failures.push(`Generated private-path candidate: ${relative}`);
  }
}

if (existsSync(path.join(outputRoot, 'reading', 'data'))) {
  failures.push('Generated output contains out/reading/data; private data must be staged only after authentication verification.');
}

const outputFiles = outputAllFiles.filter((filename) => textExtensions.has(path.extname(filename).toLowerCase()));
if (outputFiles.some((filename) => filename.endsWith('.map'))) {
  failures.push('Generated output contains source maps.');
}

const trackedTextFiles = tracked
  .filter((filename) => textExtensions.has(path.extname(filename).toLowerCase()))
  .filter((filename) => existsSync(path.join(projectRoot, filename)));
const trackedTextBodies = await Promise.all(
  trackedTextFiles.map(async (filename) => ({
    filename,
    body: await readFile(path.join(projectRoot, filename), 'utf8'),
  }))
);
for (const entry of trackedTextBodies) {
  entry.decodedBody = decodeGeneratedText(entry.body);
}

let headPaths = [];
try {
  headPaths = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .split(/\r?\n/)
    .filter(Boolean);
} catch {
  // Without a committed public baseline, no overlap receives an exemption.
}
const publicTextHeadBodies = new Map();
for (const filename of headPaths) {
  if (
    isPrivatePathCandidate(filename)
    || !textExtensions.has(path.extname(filename).toLowerCase())
  ) continue;
  try {
    const body = execFileSync('git', ['show', `HEAD:${filename}`], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    publicTextHeadBodies.set(filename, body);
  } catch {
    // An unreadable HEAD source grants no exemption and therefore fails safe.
  }
}
let publicAssetHeadBodies = [];

async function readPublicPdfBodiesAtHead() {
  const filenames = headPaths.filter((filename) =>
    filename.toLowerCase().endsWith('.pdf') && !isPrivatePathCandidate(filename)
  );
  if (filenames.length === 0) return [];

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bodies = [];
  for (const filename of filenames) {
    let loadingTask;
    try {
      const bytes = new Uint8Array(execFileSync('git', ['show', `HEAD:${filename}`], {
        cwd: projectRoot,
        encoding: null,
        maxBuffer: 128 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      }));
      loadingTask = getDocument({ data: bytes, disableWorker: true, useSystemFonts: true });
      const pdf = await loadingTask.promise;
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        pages.push(textContent.items
          .map((item) => `${item.str || ''}${item.hasEOL ? '\n' : ''}`)
          .join(''));
      }
      bodies.push(pages.join('\n'));
    } catch {
      // An unreadable baseline asset grants no exemption and therefore fails safe.
    } finally {
      await loadingTask?.destroy?.();
    }
  }
  return bodies;
}
function decodeGeneratedText(value) {
  const htmlEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  };
  return value
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_match, codePoint) => {
      const code = Number.parseInt(codePoint, 16);
      try {
        return String.fromCodePoint(code);
      } catch {
        return _match;
      }
    })
    .replace(/\\u([0-9a-f]{4})/gi, (_match, codeUnit) => String.fromCharCode(Number.parseInt(codeUnit, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_match, codeUnit) => String.fromCharCode(Number.parseInt(codeUnit, 16)))
    .replace(/&(?:amp|apos|gt|lt|quot);|&#x[0-9a-f]+;|&#\d+;/gi, (entity) => {
      const named = /^&([a-z]+);$/i.exec(entity);
      if (named) return htmlEntities[named[1].toLowerCase()] || entity;
      const numeric = /^&#(?:x([0-9a-f]+)|(\d+));$/i.exec(entity);
      const code = numeric?.[1]
        ? Number.parseInt(numeric[1], 16)
        : numeric?.[2]
          ? Number.parseInt(numeric[2], 10)
          : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        return entity;
      }
    });
}

function jsonEscaped(value) {
  const encoded = JSON.stringify(value);
  return encoded ? encoded.slice(1, -1) : value;
}

function unicodeEscaped(value) {
  return Array.from(value).map((character) => {
    const codePoint = character.codePointAt(0) || 0;
    if (codePoint <= 0xffff) return `\\u${codePoint.toString(16).padStart(4, '0')}`;
    const adjusted = codePoint - 0x10000;
    const high = 0xd800 + (adjusted >> 10);
    const low = 0xdc00 + (adjusted & 0x3ff);
    return `\\u${high.toString(16)}\\u${low.toString(16)}`;
  }).join('');
}

function countLiteralOccurrences(body, candidate, shortIdentifier) {
  if (!candidate) return 0;
  if (shortIdentifier) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Array.from(
      body.matchAll(new RegExp(`(?:^|[^A-Za-z0-9_-])${escaped}(?=$|[^A-Za-z0-9_-])`, 'g'))
    ).length;
  }

  let count = 0;
  let cursor = 0;
  while (cursor <= body.length - candidate.length) {
    const index = body.indexOf(candidate, cursor);
    if (index === -1) break;
    count += 1;
    cursor = index + candidate.length;
  }
  return count;
}

function fingerprintOccurrenceCount(body, decodedBody, candidate, shortIdentifier) {
  const encodedCount = Array.from(new Set([
    candidate,
    jsonEscaped(candidate),
    unicodeEscaped(candidate),
  ]))
    .filter(Boolean)
    .reduce(
      (count, variant) => count + countLiteralOccurrences(body, variant, shortIdentifier),
      0
    );
  const decodedCount = countLiteralOccurrences(decodedBody, candidate, shortIdentifier);
  return Math.max(encodedCount, decodedCount);
}

function containsFingerprint(body, decodedBody, candidate, shortIdentifier) {
  return fingerprintOccurrenceCount(body, decodedBody, candidate, shortIdentifier) > 0;
}
function isPublicBibliographicFact(fields) {
  return fields.every((field) =>
    /^library\.papers\[\d+\]\.(?:title|collaboration|journal|arxiv|doi|inspire)$/.test(field)
    || /^library\.papers\[\d+\]\.authors\[\d+\]$/.test(field)
    || /^library\.papers\[\d+\]\.verification\.sources\[\d+\]\.url$/.test(field)
    || /^relations\.edges\[\d+\]\.evidence\[\d+\]\.url$/.test(field)
  );
}

function publicHeadOccurrenceCount(filename, candidate, shortIdentifier) {
  const body = publicTextHeadBodies.get(filename);
  return typeof body === 'string'
    ? fingerprintOccurrenceCount(body, decodeGeneratedText(body), candidate, shortIdentifier)
    : 0;
}

function wasPublicAtHead(candidate, shortIdentifier) {
  return (
    Array.from(publicTextHeadBodies.keys()).some((filename) =>
      publicHeadOccurrenceCount(filename, candidate, shortIdentifier) > 0
    )
    || publicAssetHeadBodies.some((body) =>
      containsFingerprint(body, decodeGeneratedText(body), candidate, shortIdentifier)
    )
  );
}

if (privateDataDir) {
  const candidates = new Map();
  const privateSourceHashes = new Set();
  for (const filename of ['library.json', 'relations.json', 'threads.json', 'view_config.json']) {
    const parsed = JSON.parse(await readFile(path.join(privateDataDir, filename), 'utf8'));
    collectPrivateStrings(filename, parsed, candidates);
    if (filename === 'library.json' && /^[a-f0-9]{64}$/.test(parsed.source_document?.sha256 || '')) {
      privateSourceHashes.add(parsed.source_document.sha256);
    }
  }
  const lookupPath = path.join(privateDataDir, 'thesis_reference_lookup.json');
  if (existsSync(lookupPath)) {
    const lookup = JSON.parse(await readFile(lookupPath, 'utf8'));
    collectNestedPrivateStrings(candidates, lookup, 'thesis_reference_lookup');
  }
  publicAssetHeadBodies = await readPublicPdfBodiesAtHead();

  const pdfCandidates = [...new Set([
    ...tracked
      .map((filename) => path.join(projectRoot, filename))
      .filter((filename) => existsSync(filename)),
    ...outputAllFiles,
  ])].filter((filename) => path.extname(filename).toLowerCase() === '.pdf');
  for (const filename of pdfCandidates) {
    const digest = createHash('sha256').update(await readFile(filename)).digest('hex');
    if (privateSourceHashes.has(digest)) {
      failures.push(`Private source-document PDF found at ${path.relative(projectRoot, filename)}.`);
    }
  }

  const outputBodies = await Promise.all(outputFiles.map(async (filename) => {
    const body = await readFile(filename, 'utf8');
    return {
      filename,
      body,
      decodedBody: decodeGeneratedText(body),
    };
  }));
  let candidateIndex = 0;
  let baselineBibliographicOverlaps = 0;
  for (const [candidate, fields] of candidates) {
    candidateIndex += 1;
    const shortIdentifier = usesShortFingerprint(fields[0]);
    const bibliographicFact = isPublicBibliographicFact(fields);

    const trackedHits = trackedTextBodies.filter(({ body, decodedBody }) =>
      containsFingerprint(body, decodedBody, candidate, shortIdentifier)
    );
    let hasNewTrackedExposure = false;
    for (const { filename, body, decodedBody } of trackedHits) {
      const currentCount = fingerprintOccurrenceCount(body, decodedBody, candidate, shortIdentifier);
      const headCount = publicHeadOccurrenceCount(filename, candidate, shortIdentifier);
      if (bibliographicFact && headCount > 0 && currentCount <= headCount) {
        baselineBibliographicOverlaps += 1;
        continue;
      }
      hasNewTrackedExposure = true;
      failures.push(`Private fingerprint #${candidateIndex} (${fields.join(', ')}) found in tracked file ${filename}.`);
    }

    const hits = outputBodies.filter(({ body, decodedBody }) =>
      containsFingerprint(body, decodedBody, candidate, shortIdentifier)
    );
    for (const { filename } of hits) {
      const relativeOutput = path.relative(projectRoot, filename);
      if (
        !hasNewTrackedExposure
        && bibliographicFact
        && publicGeneratedBaselinePaths.has(relativeOutput)
        && wasPublicAtHead(candidate, shortIdentifier)
      ) {
        baselineBibliographicOverlaps += 1;
        continue;
      }
      failures.push(`Private fingerprint #${candidateIndex} (${fields.join(', ')}) found in ${relativeOutput}.`);
    }
  }
  if (baselineBibliographicOverlaps > 0) {
    process.stdout.write(`Ignored ${baselineBibliographicOverlaps} exact bibliographic overlaps already present in public Git HEAD sources.\n`);
  }
  process.stdout.write(`Scanned ${candidates.size} private string fingerprints without printing their values.\n`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Reading leak scan passed across ${tracked.length} tracked paths, ${trackedTextFiles.length} tracked text files, and ${outputFiles.length} generated text artifacts.\n`);
}
