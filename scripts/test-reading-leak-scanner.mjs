import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const privateDir = await mkdtemp(path.join(os.tmpdir(), 'reading-leak-fixture-'));
const rootProbeName = `reading-leak-probe-${process.pid}.md`;
const rootProbePath = path.join(projectRoot, rootProbeName);
const contentProbeName = `reading-leak-probe-${process.pid}.md`;
const contentProbePath = path.join(projectRoot, 'content', contentProbeName);
const baselineContentPath = path.join(projectRoot, 'content', 'publications.bib');
const generatedProbeName = `reading-leak-probe-${process.pid}.html`;
const generatedProbePath = path.join(projectRoot, 'out', generatedProbeName);
const generatedPdfProbeName = `reading-source-document-probe-${process.pid}.pdf`;
const generatedPdfProbePath = path.join(projectRoot, 'out', generatedPdfProbeName);
const rootCanary = ['SYNTHETIC', 'READING', 'TRACKED', 'BODY', 'CANARY', '8f31c2'].join('_');
const contentCanary = ['SYNTHETIC', 'READING', 'PUBLIC', 'CONTENT', 'CANARY', 'e2107d'].join('_');
let originalBaselineContent;

const supportFiles = {
  'relations.json': { edges: [] },
  'threads.json': { threads: [] },
  'view_config.json': { graph: { initial_focus_ids: [] } },
};

function scannerResult() {
  return spawnSync(process.execPath, ['scripts/scan-reading-leaks.mjs'], {
    cwd: projectRoot,
    env: { ...process.env, READING_PRIVATE_DATA_DIR: privateDir },
    encoding: 'utf8',
  });
}

async function writePrivateTitle(title) {
  await writeFile(
    path.join(privateDir, 'library.json'),
    JSON.stringify({
      source_document: { filename: 'x' },
      papers: [{ id: 'abc', title }],
    }),
    { mode: 0o600 }
  );
}

async function writePrivateLibrary(library) {
  await writeFile(path.join(privateDir, 'library.json'), JSON.stringify(library), { mode: 0o600 });
}

function privateLibrary() {
  return {
    curation_notice: 'synthetic scanner fixture',
    source_document: {
      id: 'scanner-source',
      filename: 'scanner-source.pdf',
      sha256: '0'.repeat(64),
      body_scope: {},
      bibliography_lookup: {},
      page_numbering: 'synthetic scanner numbering',
    },
    papers: [{ id: 'scannerPaper', title: 'Synthetic scanner paper' }],
  };
}

async function expectSyntheticFieldCoverage() {
  const probes = {
    sourceId: ['s7', 'Q9'].join(''),
    sourceHash: ['a19d', '03bf'].join('').repeat(8),
    pageNumbering: ['SYNTHETIC', 'SOURCE', 'METADATA', 'CANARY', 'a8f711'].join('_'),
    bodyScopeKey: ['SYNTHETIC', 'BODY', 'SCOPE', 'KEY', '3e892b'].join('_'),
    bodyScopeValue: ['SYNTHETIC', 'BODY', 'SCOPE', 'VALUE', '99a10e'].join('_'),
    lookupKey: ['SYNTHETIC', 'PRIVATE', 'LOOKUP', 'KEY', 'b091d3'].join('_'),
    lookupValue: ['SYNTHETIC', 'NESTED', 'LOOKUP', 'VALUE', 'ce1204'].join('_'),
    separateLookupValue: ['SYNTHETIC', 'SEPARATE', 'LOOKUP', 'VALUE', '7d61a0'].join('_'),
    extensionKey: ['SYNTHETIC', 'SOURCE', 'EXTENSION', 'KEY', '162df0'].join('_'),
    extensionValue: ['SYNTHETIC', 'SOURCE', 'EXTENSION', 'VALUE', '34aa6e'].join('_'),
    author: ['SYNTHETIC', 'AUTHOR', 'CANARY', 'aU91'].join('_'),
    collaboration: ['SYNTHETIC', 'COLLABORATION', 'CANARY', 'cO47'].join('_'),
    journal: ['SYNTHETIC', 'JOURNAL', 'CANARY', 'jR52'].join('_'),
    verificationUrl: ['https://example.invalid/', 'private-verification-', '763c1d'].join(''),
    relationSource: ['rS', '81'].join(''),
    relationTarget: ['rT', '26'].join(''),
    relationUrl: ['https://example.invalid/', 'private-relation-', '9f321a'].join(''),
    relationDocument: ['dC', '54'].join(''),
    threadPaper: ['tP', '73'].join(''),
  };
  const library = privateLibrary();
  library.source_document.id = probes.sourceId;
  library.source_document.sha256 = probes.sourceHash;
  library.source_document.page_numbering = probes.pageNumbering;
  library.source_document.body_scope = {
    [probes.bodyScopeKey]: { value: probes.bodyScopeValue },
  };
  library.source_document.bibliography_lookup = {
    [probes.lookupKey]: { value: probes.lookupValue },
  };
  library.source_document[probes.extensionKey] = probes.extensionValue;
  Object.assign(library.papers[0], {
    authors: [probes.author],
    collaboration: probes.collaboration,
    journal: probes.journal,
    verification: {
      sources: [{ url: probes.verificationUrl }],
    },
  });

  await writePrivateLibrary(library);
  await writeFile(
    path.join(privateDir, 'relations.json'),
    JSON.stringify({
      edges: [{
        id: 'e1',
        source: probes.relationSource,
        target: probes.relationTarget,
        evidence: [{ url: probes.relationUrl, document_id: probes.relationDocument }],
      }],
    }),
    { mode: 0o600 }
  );
  await writeFile(
    path.join(privateDir, 'threads.json'),
    JSON.stringify({ threads: [{ stages: [{ papers: [probes.threadPaper] }] }] }),
    { mode: 0o600 }
  );
  await writeFile(
    path.join(privateDir, 'thesis_reference_lookup.json'),
    JSON.stringify({ private_entry: { nested_value: probes.separateLookupValue } }),
    { mode: 0o600 }
  );
  await writeFile(
    rootProbePath,
    `${Object.values(probes).join('\n')}\n`,
    { mode: 0o600 }
  );

  const result = scannerResult();
  assert.notEqual(result.status, 0, 'Leak scanner accepted the omitted-field coverage matrix.');
  const expectedFields = [
    'library.source_document.id',
    'library.source_document.sha256',
    'library.source_document.page_numbering',
    'library.source_document.body_scope.values[0].values[0]',
    'library.source_document.bibliography_lookup.values[0].values[0]',
    'thesis_reference_lookup.values[0].values[0]',
    'library.source_document.extensions[0].value',
    'library.papers[0].authors[0]',
    'library.papers[0].collaboration',
    'library.papers[0].journal',
    'library.papers[0].verification.sources[0].url',
    'relations.edges[0].source',
    'relations.edges[0].target',
    'relations.edges[0].evidence[0].url',
    'relations.edges[0].evidence[0].document_id',
    'threads.threads[0].stages[0].papers[0]',
  ];
  for (const field of expectedFields) {
    assert(
      result.stderr.includes(`(${field}) found in tracked file ${rootProbeName}`),
      `Scanner did not attribute a synthetic probe to ${field}.`
    );
  }
  for (const value of Object.values(probes)) assertPrivateValueHidden(result, value);
  await rm(rootProbePath, { force: true });
}

function assertPrivateValueHidden(result, value) {
  assert.equal(result.stdout.includes(value), false, 'Leak scanner printed a private value to stdout.');
  assert.equal(result.stderr.includes(value), false, 'Leak scanner printed a private value to stderr.');
}

function existingPublicBibliographicTitle() {
  const result = spawnSync('git', ['show', 'HEAD:content/publications.bib'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, 'Could not read the public Git HEAD bibliography baseline.');
  const line = result.stdout
    .split(/\r?\n/)
    .find((candidate) => /^\s*title\s*=\s*\{.+\},?\s*$/i.test(candidate));
  const match = line?.match(/^\s*title\s*=\s*\{(.+)\},?\s*$/i);
  assert(match?.[1] && match[1].trim().length >= 12, 'Could not select a public Git HEAD title baseline.');
  return match[1].trim();
}

try {
  await Promise.all(
    Object.entries(supportFiles).map(([filename, value]) =>
      writeFile(path.join(privateDir, filename), JSON.stringify(value), { mode: 0o600 })
    )
  );

  await writePrivateTitle(rootCanary);
  await writeFile(rootProbePath, `Synthetic scanner probe: ${rootCanary}\n`, { mode: 0o600 });
  const rootResult = scannerResult();
  assert.notEqual(rootResult.status, 0, 'Leak scanner accepted a tracked Markdown canary.');
  assert.match(rootResult.stderr, new RegExp(`tracked file ${rootProbeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assertPrivateValueHidden(rootResult, rootCanary);
  await rm(rootProbePath, { force: true });

  await expectSyntheticFieldCoverage();

  await Promise.all(
    Object.entries(supportFiles).map(([filename, value]) =>
      writeFile(path.join(privateDir, filename), JSON.stringify(value), { mode: 0o600 })
    )
  );

  await writePrivateTitle(contentCanary);
  await writeFile(contentProbePath, `Synthetic public-content probe: ${contentCanary}\n`, { mode: 0o600 });
  const contentResult = scannerResult();
  assert.notEqual(contentResult.status, 0, 'Leak scanner accepted a new bibliographic canary under content/.');
  assert.match(contentResult.stderr, new RegExp(`tracked file content/${contentProbeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assertPrivateValueHidden(contentResult, contentCanary);
  await rm(contentProbePath, { force: true });

  const publicBaseline = existingPublicBibliographicTitle();
  await writePrivateTitle(publicBaseline);
  const baselineResult = scannerResult();
  assert.equal(
    baselineResult.status,
    0,
    `Leak scanner rejected an unchanged public Git HEAD bibliographic fact: ${baselineResult.stderr}`
  );
  assertPrivateValueHidden(baselineResult, publicBaseline);

  await writeFile(generatedProbePath, `<!doctype html><title>${publicBaseline}</title>\n`);
  const generatedResult = scannerResult();
  assert.notEqual(
    generatedResult.status,
    0,
    'Leak scanner accepted a Git HEAD bibliographic fact in a new generated page.'
  );
  assert.match(generatedResult.stderr, new RegExp(`out/${generatedProbeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assertPrivateValueHidden(generatedResult, publicBaseline);
  await rm(generatedProbePath, { force: true });

  const privatePdfBytes = Buffer.from('Synthetic private source-document binary fixture.');
  const privatePdfHash = createHash('sha256').update(privatePdfBytes).digest('hex');
  const privatePdfLibrary = privateLibrary();
  privatePdfLibrary.source_document.sha256 = privatePdfHash;
  await writePrivateLibrary(privatePdfLibrary);
  await writeFile(generatedPdfProbePath, privatePdfBytes);
  const privatePdfResult = scannerResult();
  assert.notEqual(privatePdfResult.status, 0, 'Leak scanner accepted the private source-document PDF bytes.');
  assert.match(privatePdfResult.stderr, new RegExp(`Private source-document PDF found at out/${generatedPdfProbeName}`));
  assertPrivateValueHidden(privatePdfResult, privatePdfHash);
  await rm(generatedPdfProbePath, { force: true });

  await writePrivateTitle(publicBaseline);

  originalBaselineContent = await readFile(baselineContentPath, 'utf8');
  await writeFile(
    baselineContentPath,
    `${originalBaselineContent}\n% Synthetic duplicate occurrence probe\n${publicBaseline}\n`
  );
  const duplicateResult = scannerResult();
  assert.notEqual(
    duplicateResult.status,
    0,
    'Leak scanner accepted an extra occurrence appended to an existing public content file.'
  );
  assert.match(duplicateResult.stderr, /tracked file content\/publications\.bib/);
  assertPrivateValueHidden(duplicateResult, publicBaseline);
  await writeFile(baselineContentPath, originalBaselineContent);
  originalBaselineContent = undefined;

  process.stdout.write('Reading leak-scanner self-test passed (new tracked/generated paths and duplicate occurrences rejected, exact Git HEAD baseline retained, values hidden).\n');
} finally {
  if (originalBaselineContent !== undefined) {
    await writeFile(baselineContentPath, originalBaselineContent);
  }
  await rm(rootProbePath, { force: true });
  await rm(contentProbePath, { force: true });
  await rm(generatedProbePath, { force: true });
  await rm(generatedPdfProbePath, { force: true });
  await rm(privateDir, { recursive: true, force: true });
}
