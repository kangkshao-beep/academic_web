import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  READING_PUBLIC_DATA_FILES,
  projectReadingPublicFile,
} from '../functions/reading/_public-data.mjs';

const projectRoot = process.cwd();
const fixtureRoot = path.join(projectRoot, 'tests/fixtures/reading');
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'reading-public-release-'));
const inputDir = path.join(temporaryRoot, 'private-input');
const outputDir = path.join(temporaryRoot, 'public-output');
const repositoryOutput = path.join(projectRoot, `.reading-public-release-test-${process.pid}`);
const expectedFiles = [...READING_PUBLIC_DATA_FILES].sort();

const rootKeys = {
  'library.json': ['schema_version', 'visibility', 'papers'],
  'relations.json': ['schema_version', 'visibility', 'edges'],
  'threads.json': ['schema_version', 'visibility', 'threads'],
  'view_config.json': ['schema_version', 'visibility', 'default_view', 'graph'],
};
const paperKeys = [
  'id', 'title', 'authors', 'authors_complete', 'collaboration', 'year', 'preprint_year',
  'journal', 'arxiv', 'doi', 'inspire', 'entry_type', 'role', 'topics', 'processes',
  'priority', 'priority_basis', 'reading_status', 'curation_status', 'origin',
  'bibliography_ref', 'raw_thesis_citation', 'why_it_matters', 'research_connection',
  'annotation_author', 'source_in_thesis', 'verification', 'personal_notes', 'idea_hooks',
];
const locatorKeys = ['chapter', 'section', 'printed_pages', 'pdf_pages', 'purpose'];
const verificationKeys = ['identity_status', 'checked_on', 'content_basis', 'sources', 'notes'];
const verificationSourceKeys = ['kind', 'url', 'locator'];
const edgeKeys = [
  'id', 'source', 'target', 'relation', 'layer', 'directed', 'note', 'evidence',
  'confidence', 'status',
];
const primaryEvidenceKeys = ['kind', 'url', 'locator', 'checked_on'];
const thesisEvidenceKeys = ['kind', 'chapter', 'section', 'printed_pages', 'pdf_pages'];
const threadKeys = [
  'id', 'title', 'annotation_author', 'status', 'summary', 'thesis_chapters', 'stages',
  'reading_question',
];
const stageKeys = ['label', 'papers', 'narrative'];
const graphKeys = [
  'eligible_priority_min', 'initial_focus_ids', 'default_layers',
  'curatorial_layer_default', 'default_hops', 'max_expansion_hops',
];

const canaries = Object.freeze({
  libraryRoot: 'SYNTHETIC_PRIVATE_LIBRARY_ROOT_19c4a1',
  curationNotice: 'SYNTHETIC_PRIVATE_CURATION_NOTICE_a531be',
  sourceDocument: 'SYNTHETIC_PRIVATE_SOURCE_DOCUMENT_67b202',
  bodyScope: 'SYNTHETIC_PRIVATE_BODY_SCOPE_5b1e41',
  bibliographyLookup: 'SYNTHETIC_PRIVATE_BIBLIOGRAPHY_LOOKUP_e2fc07',
  paper: 'SYNTHETIC_PRIVATE_PAPER_EXTENSION_7c96b2',
  locator: 'SYNTHETIC_PRIVATE_LOCATOR_EXTENSION_e9245a',
  verification: 'SYNTHETIC_PRIVATE_VERIFICATION_EXTENSION_70a2d4',
  verificationSource: 'SYNTHETIC_PRIVATE_VERIFICATION_SOURCE_EXTENSION_18bf2e',
  relationsRoot: 'SYNTHETIC_PRIVATE_RELATIONS_ROOT_993dc0',
  edge: 'SYNTHETIC_PRIVATE_EDGE_EXTENSION_100dca',
  primaryEvidence: 'SYNTHETIC_PRIVATE_PRIMARY_EVIDENCE_EXTENSION_52d8f0',
  documentId: 'SYNTHETIC_PRIVATE_DOCUMENT_ID_0b9dde',
  thesisEvidence: 'SYNTHETIC_PRIVATE_THESIS_EVIDENCE_EXTENSION_9ef660',
  threadsRoot: 'SYNTHETIC_PRIVATE_THREADS_ROOT_d4f6d9',
  thread: 'SYNTHETIC_PRIVATE_THREAD_EXTENSION_3d879b',
  stage: 'SYNTHETIC_PRIVATE_STAGE_EXTENSION_bf10bc',
  viewRoot: 'SYNTHETIC_PRIVATE_VIEW_ROOT_e272fd',
  graph: 'SYNTHETIC_PRIVATE_GRAPH_EXTENSION_a09c15',
});

function assertExactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} exposed an unexpected field.`);
}

function assertPublicShape(filename, value) {
  assertExactKeys(value, rootKeys[filename], filename);
  assert.equal(value.schema_version, '1.0.0', `${filename} has the wrong schema version.`);
  assert.equal(value.visibility, 'public', `${filename} is not explicitly public.`);

  if (filename === 'library.json') {
    for (const [paperIndex, paper] of value.papers.entries()) {
      assertExactKeys(paper, paperKeys, `library.papers[${paperIndex}]`);
      for (const [locatorIndex, locator] of paper.source_in_thesis.entries()) {
        assertExactKeys(locator, locatorKeys, `library.papers[${paperIndex}].source_in_thesis[${locatorIndex}]`);
      }
      assertExactKeys(paper.verification, verificationKeys, `library.papers[${paperIndex}].verification`);
      for (const [sourceIndex, source] of paper.verification.sources.entries()) {
        assertExactKeys(
          source,
          verificationSourceKeys,
          `library.papers[${paperIndex}].verification.sources[${sourceIndex}]`
        );
      }
    }
  } else if (filename === 'relations.json') {
    for (const [edgeIndex, edge] of value.edges.entries()) {
      assertExactKeys(edge, edgeKeys, `relations.edges[${edgeIndex}]`);
      for (const [evidenceIndex, evidence] of edge.evidence.entries()) {
        const expected = evidence.kind === 'primary_source' ? primaryEvidenceKeys : thesisEvidenceKeys;
        assertExactKeys(evidence, expected, `relations.edges[${edgeIndex}].evidence[${evidenceIndex}]`);
      }
    }
  } else if (filename === 'threads.json') {
    for (const [threadIndex, thread] of value.threads.entries()) {
      assertExactKeys(thread, threadKeys, `threads.threads[${threadIndex}]`);
      for (const [stageIndex, stage] of thread.stages.entries()) {
        assertExactKeys(stage, stageKeys, `threads.threads[${threadIndex}].stages[${stageIndex}]`);
      }
    }
  } else {
    assertExactKeys(value.graph, graphKeys, 'view_config.graph');
  }
}

function runBuild(input, output) {
  return spawnSync(
    process.execPath,
    ['scripts/build-reading-public-release.mjs', '--input-dir', input, '--output-dir', output],
    { cwd: projectRoot, encoding: 'utf8' }
  );
}

function injectPrivateCanaries(filename, value) {
  if (filename === 'library.json') {
    value.private_root_extension = canaries.libraryRoot;
    value.curation_notice = canaries.curationNotice;
    value.source_document.body_scope = { deeply: { nested: canaries.bodyScope } };
    value.source_document.bibliography_lookup = { deeply: { nested: canaries.bibliographyLookup } };
    value.source_document.private_extension = canaries.sourceDocument;
    value.papers[0].private_extension = canaries.paper;
    value.papers[0].source_in_thesis[0].private_extension = canaries.locator;
    value.papers[0].verification.private_extension = canaries.verification;
    value.papers[0].verification.sources[0].private_extension = canaries.verificationSource;
  } else if (filename === 'relations.json') {
    value.private_root_extension = canaries.relationsRoot;
    value.edges[0].private_extension = canaries.edge;
    const primaryEvidence = value.edges.flatMap((edge) => edge.evidence)
      .find((evidence) => evidence.kind === 'primary_source');
    const thesisEvidence = value.edges.flatMap((edge) => edge.evidence)
      .find((evidence) => evidence.kind === 'thesis_context');
    assert(primaryEvidence && thesisEvidence, 'Relations fixture must cover both evidence variants.');
    primaryEvidence.private_extension = canaries.primaryEvidence;
    thesisEvidence.document_id = canaries.documentId;
    thesisEvidence.private_extension = canaries.thesisEvidence;
  } else if (filename === 'threads.json') {
    value.private_root_extension = canaries.threadsRoot;
    value.threads[0].private_extension = canaries.thread;
    value.threads[0].stages[0].private_extension = canaries.stage;
  } else {
    value.private_root_extension = canaries.viewRoot;
    value.graph.private_extension = canaries.graph;
  }
  return value;
}

async function snapshotInput() {
  return Object.fromEntries(await Promise.all(expectedFiles.map(async (filename) => {
    const target = path.join(inputDir, filename);
    const [contents, metadata] = await Promise.all([readFile(target), stat(target)]);
    return [filename, {
      contents,
      mode: metadata.mode & 0o777,
      mtimeMs: metadata.mtimeMs,
    }];
  })));
}

async function assertInputUnchanged(before) {
  assert.deepEqual((await readdir(inputDir)).sort(), expectedFiles, 'The input directory entries changed.');
  for (const filename of expectedFiles) {
    const target = path.join(inputDir, filename);
    const [contents, metadata] = await Promise.all([readFile(target), stat(target)]);
    assert.deepEqual(contents, before[filename].contents, `${filename} input bytes changed.`);
    assert.equal(metadata.mode & 0o777, before[filename].mode, `${filename} input mode changed.`);
    assert.equal(metadata.mtimeMs, before[filename].mtimeMs, `${filename} input mtime changed.`);
  }
}

async function assertPathMissing(target, label) {
  await assert.rejects(access(target), (error) => {
    assert.equal(error?.code, 'ENOENT', `${label} failed for an unexpected reason.`);
    return true;
  });
}

let invalidBundleIndex = 0;
async function assertInvalidBundleRejected(label, mutate) {
  invalidBundleIndex += 1;
  const caseRoot = path.join(temporaryRoot, `invalid-bundle-${invalidBundleIndex}`);
  const caseInput = path.join(caseRoot, 'input');
  const caseOutput = path.join(caseRoot, 'output');
  await mkdir(caseInput, { recursive: true, mode: 0o700 });
  const files = Object.fromEntries(await Promise.all(expectedFiles.map(async (filename) => [
    filename,
    JSON.parse(await readFile(path.join(inputDir, filename), 'utf8')),
  ])));
  mutate(files);
  await Promise.all(expectedFiles.map((filename) =>
    writeFile(path.join(caseInput, filename), JSON.stringify(files[filename]), { mode: 0o600 })
  ));

  const result = runBuild(caseInput, caseOutput);
  assert.notEqual(result.status, 0, `${label} was accepted by the public release builder.`);
  assert.match(result.stderr, /^Reading public release build failed\.\n$/);
  await assertPathMissing(caseOutput, label);
}

try {
  await mkdir(inputDir, { mode: 0o700 });
  await Promise.all(expectedFiles.map(async (filename) => {
    const source = JSON.parse(await readFile(path.join(fixtureRoot, filename), 'utf8'));
    const fixture = injectPrivateCanaries(filename, source);
    await writeFile(path.join(inputDir, filename), `${JSON.stringify(fixture, null, 2)}\n`, { mode: 0o600 });
  }));
  const inputBefore = await snapshotInput();

  const result = runBuild(inputDir, outputDir);
  assert.equal(result.status, 0, `Public release build failed: ${result.stderr}`);
  assert.match(result.stdout, /Built four allowlisted Reading public release files\./);
  await assertInputUnchanged(inputBefore);

  const outputEntries = await readdir(outputDir, { withFileTypes: true });
  assert.deepEqual(outputEntries.map((entry) => entry.name).sort(), expectedFiles, 'Output must contain only four JSON files.');
  assert(outputEntries.every((entry) => entry.isFile()), 'Every public release entry must be a regular file.');

  const publicFiles = {};
  for (const filename of expectedFiles) {
    const target = path.join(outputDir, filename);
    const [raw, metadata] = await Promise.all([readFile(target, 'utf8'), stat(target)]);
    assert.equal(metadata.mode & 0o777, 0o600, `${filename} must use mode 0600.`);
    const parsed = JSON.parse(raw);
    assertPublicShape(filename, parsed);
    assert.deepEqual(
      projectReadingPublicFile(filename, parsed, 'public'),
      parsed,
      `${filename} is not a strict public Reading DTO.`
    );
    publicFiles[filename] = parsed;
  }

  const serializedOutput = JSON.stringify(publicFiles);
  for (const canary of Object.values(canaries)) {
    assert.equal(serializedOutput.includes(canary), false, 'A private synthetic canary reached the public release.');
  }
  for (const forbiddenField of [
    'source_document',
    'body_scope',
    'bibliography_lookup',
    'document_id',
    'question_status',
    'generated_on',
    'curation_notice',
    'hypothesis_edges',
    'hypothesis_layer_default',
    'initial_node_limit',
    'public_seed_export_enabled',
    'weekly_agent_enabled',
    'web_editing_enabled',
    'private_extension',
    'private_root_extension',
  ]) {
    assert.equal(
      serializedOutput.includes(`\"${forbiddenField}\"`),
      false,
      `Private field ${forbiddenField} reached the public release.`
    );
  }

  const repositoryResult = runBuild(inputDir, repositoryOutput);
  assert.notEqual(repositoryResult.status, 0, 'A public release output inside the repository was accepted.');
  await assertPathMissing(repositoryOutput, 'Repository-contained output rejection');

  const inputContainedOutput = path.join(inputDir, 'nested-public-output');
  const inputResult = runBuild(inputDir, inputContainedOutput);
  assert.notEqual(inputResult.status, 0, 'A public release output inside the private input was accepted.');
  await assertPathMissing(inputContainedOutput, 'Input-contained output rejection');
  await assertInputUnchanged(inputBefore);

  await assertInvalidBundleRejected('Empty paper collection', (files) => {
    files['library.json'].papers = [];
  });
  await assertInvalidBundleRejected('Empty thread collection', (files) => {
    files['threads.json'].threads = [];
  });
  await assertInvalidBundleRejected('Default hops beyond the expansion limit', (files) => {
    files['view_config.json'].graph.default_hops = 2;
    files['view_config.json'].graph.max_expansion_hops = 1;
  });
  await assertInvalidBundleRejected('Invalid relation layer semantics', (files) => {
    files['relations.json'].edges[0].layer = 'curatorial';
  });
  await assertInvalidBundleRejected('Duplicate relation triple', (files) => {
    const duplicate = structuredClone(files['relations.json'].edges[0]);
    duplicate.id = 'e99';
    files['relations.json'].edges.push(duplicate);
  });
  await assertInvalidBundleRejected('Invalid thesis page offset', (files) => {
    files['library.json'].papers[0].source_in_thesis[0].pdf_pages = [15];
  });

  process.stdout.write('Reading public release checks passed (allowlist, bundle invariants, immutability, permissions, and path isolation).\n');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
  await rm(repositoryOutput, { recursive: true, force: true });
}
