import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const fixtureRoot = path.join(projectRoot, 'tests/fixtures/reading');
const compileDir = await mkdtemp(path.join(os.tmpdir(), 'reading-validator-'));

function clone(value) {
  return structuredClone(value);
}

async function readJson(filename) {
  return JSON.parse(await readFile(path.join(fixtureRoot, filename), 'utf8'));
}

try {
  execFileSync(
    path.join(projectRoot, 'node_modules/.bin/tsc'),
    [
      '--pretty',
      'false',
      '--target',
      'ES2022',
      '--module',
      'commonjs',
      '--moduleResolution',
      'node',
      '--esModuleInterop',
      '--skipLibCheck',
      '--outDir',
      compileDir,
      'src/lib/reading/types.ts',
      'src/lib/reading/validate.ts',
    ],
    { cwd: projectRoot, stdio: 'pipe' }
  );

  const require = createRequire(import.meta.url);
  const { ReadingDataError, validateReadingBundle } = require(path.join(compileDir, 'validate.js'));
  const base = {
    library: await readJson('library.json'),
    relations: await readJson('relations.json'),
    threads: await readJson('threads.json'),
    viewConfig: await readJson('view_config.json'),
  };

  const valid = validateReadingBundle(clone(base));
  assert.equal(valid.library.papers.length, 4, 'The complete synthetic bundle must be accepted.');
  assert.equal(valid.threads.threads[1].stages[0].papers.length, 0, 'An intentional empty thread stage must remain valid.');

  const sourceDocumentWithExtension = clone(base);
  sourceDocumentWithExtension.library.source_document.synthetic_extension = true;
  validateReadingBundle(sourceDocumentWithExtension);

  const emptyNullableMetadata = clone(base);
  Object.assign(emptyNullableMetadata.library.papers[0], {
    collaboration: '',
    journal: '',
    arxiv: '',
    doi: '',
    inspire: '',
    raw_thesis_citation: '',
  });
  validateReadingBundle(emptyNullableMetadata);

  const earlyCalendarDate = clone(base);
  earlyCalendarDate.library.generated_on = '0099-01-01';
  validateReadingBundle(earlyCalendarDate);

  function expectInvalid(label, mutate, expectedPath) {
    const candidate = clone(base);
    mutate(candidate);
    assert.throws(
      () => validateReadingBundle(candidate),
      (error) => {
        assert.ok(error instanceof ReadingDataError, `${label}: wrong error type.`);
        assert.equal(error.message, `数据字段无效：${expectedPath}`, `${label}: wrong private-safe field path.`);
        return true;
      },
      label
    );
  }

  const cases = [
    {
      label: 'authors require at least one item',
      path: 'library.papers[0].authors',
      mutate: (data) => { data.library.papers[0].authors = []; },
    },
    {
      label: 'authors cannot contain blank items',
      path: 'library.papers[0].authors[0]',
      mutate: (data) => { data.library.papers[0].authors[0] = '   '; },
    },
    {
      label: 'thesis printed pages require at least one item',
      path: 'library.papers[0].source_in_thesis[0].printed_pages',
      mutate: (data) => { data.library.papers[0].source_in_thesis[0].printed_pages = []; },
    },
    {
      label: 'thesis printed pages must be unique',
      path: 'library.papers[0].source_in_thesis[0].printed_pages',
      mutate: (data) => { data.library.papers[0].source_in_thesis[0].printed_pages = [1, 1]; },
    },
    {
      label: 'verification sources require at least one item',
      path: 'library.papers[0].verification.sources',
      mutate: (data) => { data.library.papers[0].verification.sources = []; },
    },
    {
      label: 'verification source URLs must be absolute HTTP URLs',
      path: 'library.papers[0].verification.sources[0].url',
      mutate: (data) => { data.library.papers[0].verification.sources[0].url = 'relative/path'; },
    },
    {
      label: 'topics must be unique',
      path: 'library.papers[0].topics',
      mutate: (data) => { data.library.papers[0].topics = ['baseline', 'baseline']; },
    },
    {
      label: 'paper IDs must match the stable ID pattern',
      path: 'library.papers[0].id',
      mutate: (data) => { data.library.papers[0].id = '1-invalid'; },
    },
    {
      label: 'source hashes must be lowercase SHA-256',
      path: 'library.source_document.sha256',
      mutate: (data) => { data.library.source_document.sha256 = 'not-a-hash'; },
    },
    {
      label: 'generated dates must be real calendar dates',
      path: 'library.generated_on',
      mutate: (data) => { data.library.generated_on = '2026-02-30'; },
    },
    {
      label: 'verification dates use the date format',
      path: 'library.papers[0].verification.checked_on',
      mutate: (data) => { data.library.papers[0].verification.checked_on = '14/09/2026'; },
    },
    {
      label: 'unknown paper fields are rejected',
      path: 'library.papers[0].synthetic_unknown',
      mutate: (data) => { data.library.papers[0].synthetic_unknown = true; },
    },
    {
      label: 'paper IDs must be unique',
      path: 'library.papers.id',
      mutate: (data) => { data.library.papers[1].id = data.library.papers[0].id; },
    },
    {
      label: 'paper and edge IDs share one graph namespace',
      path: 'relations.edges.id',
      mutate: (data) => {
        const previousId = data.library.papers[0].id;
        data.library.papers[0].id = 'e1';
        data.relations.edges.forEach((edge) => {
          if (edge.source === previousId) edge.source = 'e1';
          if (edge.target === previousId) edge.target = 'e1';
        });
        data.threads.threads.forEach((thread) => thread.stages.forEach((stage) => {
          stage.papers = stage.papers.map((paperId) => paperId === previousId ? 'e1' : paperId);
        }));
        data.viewConfig.graph.initial_focus_ids = data.viewConfig.graph.initial_focus_ids
          .map((paperId) => paperId === previousId ? 'e1' : paperId);
      },
    },
    {
      label: 'non-null identifiers must be unique',
      path: 'library.papers.arxiv',
      mutate: (data) => { data.library.papers[1].arxiv = data.library.papers[0].arxiv; },
    },
    {
      label: 'role values stay within the schema enum',
      path: 'library.papers[0].role',
      mutate: (data) => { data.library.papers[0].role = 'invented-role'; },
    },
    {
      label: 'edge IDs must match their pattern',
      path: 'relations.edges[0].id',
      mutate: (data) => { data.relations.edges[0].id = 'edge-one'; },
    },
    {
      label: 'edge evidence requires at least one item',
      path: 'relations.edges[0].evidence',
      mutate: (data) => { data.relations.edges[0].evidence = []; },
    },
    {
      label: 'primary evidence dates use the date format',
      path: 'relations.edges[0].evidence[0].checked_on',
      mutate: (data) => { data.relations.edges[0].evidence[0].checked_on = 'tomorrow'; },
    },
    {
      label: 'edge endpoints must reference papers',
      path: 'relations.edges[0]',
      mutate: (data) => { data.relations.edges[0].target = 'missingPaper'; },
    },
    {
      label: 'thesis evidence references the source document',
      path: 'relations.edges[1].evidence.thesis_context',
      mutate: (data) => { data.relations.edges[1].evidence[1].document_id = 'different-source'; },
    },
    {
      label: 'thesis evidence preserves the PDF page offset',
      path: 'relations.edges[1].evidence.thesis_context',
      mutate: (data) => { data.relations.edges[1].evidence[1].pdf_pages = [15]; },
    },
    {
      label: 'thread chapter arrays must be unique',
      path: 'threads.threads[0].thesis_chapters',
      mutate: (data) => { data.threads.threads[0].thesis_chapters = [1, 1]; },
    },
    {
      label: 'thread paper arrays must be unique',
      path: 'threads.threads[0].stages[0].papers',
      mutate: (data) => { data.threads.threads[0].stages[0].papers = ['syntheticPrimer', 'syntheticPrimer']; },
    },
    {
      label: 'thread paper references must resolve',
      path: 'threads.threads[0].stages[0].papers',
      mutate: (data) => { data.threads.threads[0].stages[0].papers = ['missingPaper']; },
    },
    {
      label: 'focus IDs must be unique',
      path: 'view_config.graph.initial_focus_ids',
      mutate: (data) => { data.viewConfig.graph.initial_focus_ids = ['syntheticPrimer', 'syntheticPrimer']; },
    },
    {
      label: 'focus IDs require at least one initial node',
      path: 'view_config.graph.initial_focus_ids',
      mutate: (data) => { data.viewConfig.graph.initial_focus_ids = []; },
    },
    {
      label: 'default graph layers require at least one layer',
      path: 'view_config.graph.default_layers',
      mutate: (data) => { data.viewConfig.graph.default_layers = []; },
    },
    {
      label: 'focus IDs must respect graph eligibility',
      path: 'view_config.graph.initial_focus_ids',
      mutate: (data) => { data.viewConfig.graph.initial_focus_ids = ['syntheticReview']; },
    },
    {
      label: 'focus IDs must stay within the initial node limit',
      path: 'view_config.graph.initial_focus_ids',
      mutate: (data) => { data.viewConfig.graph.initial_node_limit = 1; },
    },
    {
      label: 'default hops cannot exceed maximum expansion',
      path: 'view_config.graph.default_hops',
      mutate: (data) => { data.viewConfig.graph.default_hops = 2; data.viewConfig.graph.max_expansion_hops = 1; },
    },
    {
      label: 'curatorial graph claims remain off by default',
      path: 'view_config.graph.default_layers',
      mutate: (data) => { data.viewConfig.graph.curatorial_layer_default = true; },
    },
    {
      label: 'public export remains disabled',
      path: 'view_config.public_seed_export_enabled',
      mutate: (data) => { data.viewConfig.public_seed_export_enabled = true; },
    },
  ];

  for (const testCase of cases) {
    expectInvalid(testCase.label, testCase.mutate, testCase.path);
  }

  process.stdout.write(`Reading runtime validator checks passed (${cases.length + 2} synthetic cases).\n`);
} finally {
  await rm(compileDir, { recursive: true, force: true });
}
