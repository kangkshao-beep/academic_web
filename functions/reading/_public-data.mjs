const PUBLIC_FILES = new Set([
  'library.json',
  'relations.json',
  'threads.json',
  'view_config.json',
]);

function record(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid Reading field: ${path}`);
  }
  return value;
}

function list(value, path) {
  if (!Array.isArray(value)) throw new Error(`Invalid Reading field: ${path}`);
  return value;
}

function required(value, key, path) {
  if (!Object.hasOwn(value, key)) throw new Error(`Missing Reading field: ${path}.${key}`);
  return value[key];
}

function exactKeys(value, allowed, path) {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new Error(`Unexpected Reading field: ${path}.${key}`);
  }
}

function text(value, path, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    throw new Error(`Invalid Reading field: ${path}`);
  }
  return value;
}

function nullableText(value, path) {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`Invalid Reading field: ${path}`);
  return value;
}

function boolean(value, path) {
  if (typeof value !== 'boolean') throw new Error(`Invalid Reading field: ${path}`);
  return value;
}

function integer(value, path, minimum, maximum) {
  if (
    !Number.isInteger(value)
    || (minimum !== undefined && value < minimum)
    || (maximum !== undefined && value > maximum)
  ) {
    throw new Error(`Invalid Reading field: ${path}`);
  }
  return value;
}

function oneOf(value, values, path) {
  if (!values.includes(value)) throw new Error(`Invalid Reading field: ${path}`);
  return value;
}

function textList(value, path, { minimum = 0, unique = false } = {}) {
  const output = list(value, path).map((item, index) => text(item, `${path}[${index}]`));
  if (output.length < minimum || (unique && new Set(output).size !== output.length)) {
    throw new Error(`Invalid Reading field: ${path}`);
  }
  return output;
}

function integerList(value, path, { minimum = 0, itemMinimum, itemMaximum, unique = false } = {}) {
  const output = list(value, path).map((item, index) =>
    integer(item, `${path}[${index}]`, itemMinimum, itemMaximum)
  );
  if (output.length < minimum || (unique && new Set(output).size !== output.length)) {
    throw new Error(`Invalid Reading field: ${path}`);
  }
  return output;
}

function isoDate(value, path) {
  const output = text(value, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(output);
  if (!match) throw new Error(`Invalid Reading field: ${path}`);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    Number.isNaN(date.valueOf())
    || date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() + 1 !== Number(match[2])
    || date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`Invalid Reading field: ${path}`);
  }
  return output;
}

function identifier(value, path, pattern) {
  const output = text(value, path);
  if (!pattern.test(output)) throw new Error(`Invalid Reading field: ${path}`);
  return output;
}

function httpUrl(value, path) {
  const output = text(value, path);
  if (/[%](?![0-9a-f]{2})/i.test(output) || /[\u0000-\u0020<>"`]/.test(output)) {
    throw new Error(`Invalid Reading field: ${path}`);
  }
  let parsed;
  try {
    parsed = new URL(output);
  } catch {
    throw new Error(`Invalid Reading field: ${path}`);
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || parsed.username !== ''
    || parsed.password !== ''
  ) {
    throw new Error(`Invalid Reading field: ${path}`);
  }
  return output;
}

const PAPER_FIELDS = [
  'id', 'title', 'authors', 'authors_complete', 'collaboration', 'year', 'preprint_year',
  'journal', 'arxiv', 'doi', 'inspire', 'entry_type', 'role', 'topics', 'processes',
  'priority', 'priority_basis', 'reading_status', 'curation_status', 'origin',
  'bibliography_ref', 'raw_thesis_citation', 'why_it_matters', 'research_connection',
  'annotation_author', 'source_in_thesis', 'verification', 'personal_notes', 'idea_hooks',
];
const LOCATOR_FIELDS = ['chapter', 'section', 'printed_pages', 'pdf_pages', 'purpose'];
const VERIFICATION_FIELDS = ['identity_status', 'checked_on', 'content_basis', 'sources', 'notes'];
const VERIFICATION_SOURCE_FIELDS = ['kind', 'url', 'locator'];
const EDGE_FIELDS = [
  'id', 'source', 'target', 'relation', 'layer', 'directed', 'note', 'evidence',
  'confidence', 'status',
];
const PRIMARY_EVIDENCE_FIELDS = ['kind', 'url', 'locator', 'checked_on'];
const THESIS_EVIDENCE_FIELDS = ['kind', 'chapter', 'section', 'printed_pages', 'pdf_pages'];
const THREAD_FIELDS = [
  'id', 'title', 'annotation_author', 'status', 'summary', 'thesis_chapters', 'stages',
  'reading_question',
];
const STAGE_FIELDS = ['label', 'papers', 'narrative'];
const GRAPH_FIELDS = [
  'eligible_priority_min', 'initial_focus_ids', 'default_layers',
  'curatorial_layer_default', 'default_hops', 'max_expansion_hops',
];

const PUBLIC_ROOT_KEYS = {
  'library.json': ['schema_version', 'visibility', 'papers'],
  'relations.json': ['schema_version', 'visibility', 'edges'],
  'threads.json': ['schema_version', 'visibility', 'threads'],
  'view_config.json': ['schema_version', 'visibility', 'default_view', 'graph'],
};

function requireSourceVisibility(value, sourceVisibility, path) {
  if (required(value, 'visibility', path) !== sourceVisibility) {
    throw new Error(`Invalid Reading visibility: ${path}.visibility`);
  }
}

function projectPaper(value, sourceVisibility, index) {
  const path = `library.papers[${index}]`;
  const input = record(value, path);
  if (sourceVisibility === 'public') exactKeys(input, PAPER_FIELDS, path);
  else requireSourceVisibility(input, sourceVisibility, path);
  const sourceInThesis = list(required(input, 'source_in_thesis', path), `${path}.source_in_thesis`).map((entry, itemIndex) => {
    const itemPath = `${path}.source_in_thesis[${itemIndex}]`;
    const item = record(entry, itemPath);
    if (sourceVisibility === 'public') exactKeys(item, LOCATOR_FIELDS, itemPath);
    return {
      chapter: integer(required(item, 'chapter', itemPath), `${itemPath}.chapter`, 1, 7),
      section: text(required(item, 'section', itemPath), `${itemPath}.section`),
      printed_pages: integerList(required(item, 'printed_pages', itemPath), `${itemPath}.printed_pages`, { minimum: 1, itemMinimum: 1, unique: true }),
      pdf_pages: integerList(required(item, 'pdf_pages', itemPath), `${itemPath}.pdf_pages`, { minimum: 1, itemMinimum: 1, unique: true }),
      purpose: text(required(item, 'purpose', itemPath), `${itemPath}.purpose`),
    };
  });

  const verificationPath = `${path}.verification`;
  const verification = record(required(input, 'verification', path), verificationPath);
  if (sourceVisibility === 'public') exactKeys(verification, VERIFICATION_FIELDS, verificationPath);
  const sources = list(required(verification, 'sources', verificationPath), `${verificationPath}.sources`).map((entry, itemIndex) => {
    const itemPath = `${verificationPath}.sources[${itemIndex}]`;
    const item = record(entry, itemPath);
    if (sourceVisibility === 'public') exactKeys(item, VERIFICATION_SOURCE_FIELDS, itemPath);
    return {
      kind: text(required(item, 'kind', itemPath), `${itemPath}.kind`),
      url: httpUrl(required(item, 'url', itemPath), `${itemPath}.url`),
      locator: text(required(item, 'locator', itemPath), `${itemPath}.locator`),
    };
  });
  if (sources.length === 0) throw new Error(`Invalid Reading field: ${verificationPath}.sources`);

  return {
    id: identifier(required(input, 'id', path), `${path}.id`, /^[a-z][A-Za-z0-9_-]*$/),
    title: text(required(input, 'title', path), `${path}.title`),
    authors: textList(required(input, 'authors', path), `${path}.authors`, { minimum: 1 }),
    authors_complete: boolean(required(input, 'authors_complete', path), `${path}.authors_complete`),
    collaboration: nullableText(required(input, 'collaboration', path), `${path}.collaboration`),
    year: integer(required(input, 'year', path), `${path}.year`, 1900, 2200),
    preprint_year: required(input, 'preprint_year', path) === null
      ? null
      : integer(required(input, 'preprint_year', path), `${path}.preprint_year`),
    journal: nullableText(required(input, 'journal', path), `${path}.journal`),
    arxiv: nullableText(required(input, 'arxiv', path), `${path}.arxiv`),
    doi: nullableText(required(input, 'doi', path), `${path}.doi`),
    inspire: nullableText(required(input, 'inspire', path), `${path}.inspire`),
    entry_type: oneOf(required(input, 'entry_type', path), ['article', 'book', 'proceedings', 'preprint'], `${path}.entry_type`),
    role: oneOf(required(input, 'role', path), ['foundation', 'method', 'phenomenology', 'experiment', 'review', 'frontier'], `${path}.role`),
    topics: textList(required(input, 'topics', path), `${path}.topics`, { unique: true }),
    processes: textList(required(input, 'processes', path), `${path}.processes`, { unique: true }),
    priority: integer(required(input, 'priority', path), `${path}.priority`, 1, 5),
    priority_basis: oneOf(required(input, 'priority_basis', path), ['assistant_proposed_curatorial_relevance', 'user_confirmed'], `${path}.priority_basis`),
    reading_status: oneOf(required(input, 'reading_status', path), ['unknown', 'to_read', 'skimmed', 'read', 'deep_read', 'revisit'], `${path}.reading_status`),
    curation_status: oneOf(required(input, 'curation_status', path), ['proposed', 'accepted', 'archived'], `${path}.curation_status`),
    origin: oneOf(required(input, 'origin', path), ['thesis_ch1_7', 'bibliography_only', 'external_supplement'], `${path}.origin`),
    bibliography_ref: required(input, 'bibliography_ref', path) === null
      ? null
      : integer(required(input, 'bibliography_ref', path), `${path}.bibliography_ref`, 1),
    raw_thesis_citation: nullableText(required(input, 'raw_thesis_citation', path), `${path}.raw_thesis_citation`),
    why_it_matters: text(required(input, 'why_it_matters', path), `${path}.why_it_matters`),
    research_connection: text(required(input, 'research_connection', path), `${path}.research_connection`),
    annotation_author: oneOf(required(input, 'annotation_author', path), ['assistant', 'user'], `${path}.annotation_author`),
    source_in_thesis: sourceInThesis,
    verification: {
      identity_status: oneOf(required(verification, 'identity_status', verificationPath), ['primary_record_checked', 'thesis_only', 'needs_review'], `${verificationPath}.identity_status`),
      checked_on: isoDate(required(verification, 'checked_on', verificationPath), `${verificationPath}.checked_on`),
      content_basis: text(required(verification, 'content_basis', verificationPath), `${verificationPath}.content_basis`),
      sources,
      notes: textList(required(verification, 'notes', verificationPath), `${verificationPath}.notes`),
    },
    personal_notes: text(required(input, 'personal_notes', path), `${path}.personal_notes`, true),
    idea_hooks: textList(required(input, 'idea_hooks', path), `${path}.idea_hooks`),
  };
}

function projectEvidence(value, sourceVisibility, path) {
  const input = record(value, path);
  const kind = required(input, 'kind', path);
  const fields = kind === 'primary_source' ? PRIMARY_EVIDENCE_FIELDS : THESIS_EVIDENCE_FIELDS;
  if (kind !== 'primary_source' && kind !== 'thesis_context') {
    throw new Error(`Invalid Reading field: ${path}.kind`);
  }
  if (sourceVisibility === 'public') exactKeys(input, fields, path);
  if (kind === 'primary_source') {
    return {
      kind,
      url: httpUrl(required(input, 'url', path), `${path}.url`),
      locator: text(required(input, 'locator', path), `${path}.locator`),
      checked_on: isoDate(required(input, 'checked_on', path), `${path}.checked_on`),
    };
  }
  return {
    kind,
    chapter: integer(required(input, 'chapter', path), `${path}.chapter`, 1, 7),
    section: text(required(input, 'section', path), `${path}.section`),
    printed_pages: integerList(required(input, 'printed_pages', path), `${path}.printed_pages`, { minimum: 1, itemMinimum: 1, unique: true }),
    pdf_pages: integerList(required(input, 'pdf_pages', path), `${path}.pdf_pages`, { minimum: 1, itemMinimum: 1, unique: true }),
  };
}

function projectRelation(value, sourceVisibility, index) {
  const path = `relations.edges[${index}]`;
  const input = record(value, path);
  if (sourceVisibility === 'public') exactKeys(input, EDGE_FIELDS, path);
  else requireSourceVisibility(input, sourceVisibility, path);
  const evidence = list(required(input, 'evidence', path), `${path}.evidence`).map((entry, itemIndex) =>
    projectEvidence(entry, sourceVisibility, `${path}.evidence[${itemIndex}]`)
  );
  if (evidence.length === 0) throw new Error(`Invalid Reading field: ${path}.evidence`);
  return {
    id: identifier(required(input, 'id', path), `${path}.id`, /^e[0-9]+$/),
    source: identifier(required(input, 'source', path), `${path}.source`, /^[a-z][A-Za-z0-9_-]*$/),
    target: identifier(required(input, 'target', path), `${path}.target`, /^[a-z][A-Za-z0-9_-]*$/),
    relation: oneOf(required(input, 'relation', path), ['cites', 'uses_framework_of', 'uses_data_from', 'cross_checks_against', 'adapts_method_of', 'updates_software_of', 'curated_connection'], `${path}.relation`),
    layer: oneOf(required(input, 'layer', path), ['citation', 'documented_semantic', 'curatorial'], `${path}.layer`),
    directed: boolean(required(input, 'directed', path), `${path}.directed`),
    note: text(required(input, 'note', path), `${path}.note`),
    evidence,
    confidence: oneOf(required(input, 'confidence', path), ['high', 'curatorial'], `${path}.confidence`),
    status: oneOf(required(input, 'status', path), ['evidence_checked', 'proposed'], `${path}.status`),
  };
}

function projectThread(value, sourceVisibility, index) {
  const path = `threads.threads[${index}]`;
  const input = record(value, path);
  if (sourceVisibility === 'public') exactKeys(input, THREAD_FIELDS, path);
  else requireSourceVisibility(input, sourceVisibility, path);
  const stages = list(required(input, 'stages', path), `${path}.stages`).map((entry, itemIndex) => {
    const itemPath = `${path}.stages[${itemIndex}]`;
    const item = record(entry, itemPath);
    if (sourceVisibility === 'public') exactKeys(item, STAGE_FIELDS, itemPath);
    return {
      label: text(required(item, 'label', itemPath), `${itemPath}.label`),
      papers: textList(required(item, 'papers', itemPath), `${itemPath}.papers`, { unique: true }),
      narrative: text(required(item, 'narrative', itemPath), `${itemPath}.narrative`),
    };
  });
  if (stages.length === 0) throw new Error(`Invalid Reading field: ${path}.stages`);
  return {
    id: text(required(input, 'id', path), `${path}.id`),
    title: text(required(input, 'title', path), `${path}.title`),
    annotation_author: oneOf(required(input, 'annotation_author', path), ['assistant', 'user'], `${path}.annotation_author`),
    status: oneOf(required(input, 'status', path), ['proposed', 'accepted'], `${path}.status`),
    summary: text(required(input, 'summary', path), `${path}.summary`),
    thesis_chapters: integerList(required(input, 'thesis_chapters', path), `${path}.thesis_chapters`, { itemMinimum: 1, itemMaximum: 7, unique: true }),
    stages,
    reading_question: text(required(input, 'reading_question', path), `${path}.reading_question`),
  };
}

export function projectReadingPublicFile(filename, value, sourceVisibility) {
  if (!PUBLIC_FILES.has(filename)) throw new Error('Unsupported Reading data file.');
  if (sourceVisibility !== 'private' && sourceVisibility !== 'public') {
    throw new Error('Unsupported Reading source visibility.');
  }

  const input = record(value, filename);
  requireSourceVisibility(input, sourceVisibility, filename);
  if (sourceVisibility === 'public') exactKeys(input, PUBLIC_ROOT_KEYS[filename], filename);
  const schemaVersion = oneOf(required(input, 'schema_version', filename), ['1.0.0'], `${filename}.schema_version`);

  if (filename === 'library.json') {
    return {
      schema_version: schemaVersion,
      visibility: 'public',
      papers: list(required(input, 'papers', filename), 'library.papers').map((paper, index) =>
        projectPaper(paper, sourceVisibility, index)
      ),
    };
  }
  if (filename === 'relations.json') {
    return {
      schema_version: schemaVersion,
      visibility: 'public',
      edges: list(required(input, 'edges', filename), 'relations.edges').map((edge, index) =>
        projectRelation(edge, sourceVisibility, index)
      ),
    };
  }
  if (filename === 'threads.json') {
    return {
      schema_version: schemaVersion,
      visibility: 'public',
      threads: list(required(input, 'threads', filename), 'threads.threads').map((thread, index) =>
        projectThread(thread, sourceVisibility, index)
      ),
    };
  }

  const graph = record(required(input, 'graph', filename), 'view_config.graph');
  if (sourceVisibility === 'public') exactKeys(graph, GRAPH_FIELDS, 'view_config.graph');
  if (sourceVisibility === 'private') {
    for (const field of ['public_seed_export_enabled', 'weekly_agent_enabled', 'web_editing_enabled']) {
      if (required(input, field, filename) !== false) throw new Error(`Reading feature must be disabled: ${field}`);
    }
    if (required(graph, 'hypothesis_layer_default', 'view_config.graph') !== false) {
      throw new Error('Reading hypothesis layer must be disabled.');
    }
  }
  return {
    schema_version: schemaVersion,
    visibility: 'public',
    default_view: oneOf(required(input, 'default_view', filename), ['library', 'map', 'threads'], 'view_config.default_view'),
    graph: {
      eligible_priority_min: integer(required(graph, 'eligible_priority_min', 'view_config.graph'), 'view_config.graph.eligible_priority_min', 1, 5),
      initial_focus_ids: textList(required(graph, 'initial_focus_ids', 'view_config.graph'), 'view_config.graph.initial_focus_ids', { minimum: 1, unique: true }),
      default_layers: textList(required(graph, 'default_layers', 'view_config.graph'), 'view_config.graph.default_layers', { minimum: 1, unique: true }).map((layer, index) =>
        oneOf(layer, ['citation', 'documented_semantic', 'curatorial'], `view_config.graph.default_layers[${index}]`)
      ),
      curatorial_layer_default: boolean(required(graph, 'curatorial_layer_default', 'view_config.graph'), 'view_config.graph.curatorial_layer_default'),
      default_hops: integer(required(graph, 'default_hops', 'view_config.graph'), 'view_config.graph.default_hops', 0, 2),
      max_expansion_hops: integer(required(graph, 'max_expansion_hops', 'view_config.graph'), 'view_config.graph.max_expansion_hops', 1, 2),
    },
  };
}

const CHAPTER_PAGE_RANGES = {
  1: [1, 3],
  2: [4, 10],
  3: [11, 38],
  4: [39, 66],
  5: [67, 70],
  6: [71, 85],
  7: [86, 95],
};

function requireUnique(values, path) {
  if (new Set(values).size !== values.length) {
    throw new Error(`Invalid Reading field: ${path}`);
  }
}

function validatePageLocator(locator, path) {
  const [minimum, maximum] = CHAPTER_PAGE_RANGES[locator.chapter];
  if (
    locator.printed_pages.some((page) => page < minimum || page > maximum)
    || locator.pdf_pages.length !== locator.printed_pages.length
    || locator.pdf_pages.some((page, index) => page !== locator.printed_pages[index] + 13)
  ) {
    throw new Error(`Invalid Reading field: ${path}`);
  }
}

function validatePublicBundleInvariants(files) {
  const library = files['library.json'];
  const relations = files['relations.json'];
  const threads = files['threads.json'];
  const viewConfig = files['view_config.json'];

  if (library.papers.length === 0) throw new Error('Invalid Reading field: library.papers');
  if (threads.threads.length === 0) throw new Error('Invalid Reading field: threads.threads');

  const paperIds = library.papers.map((paper) => paper.id);
  requireUnique(paperIds, 'library.papers.id');
  const knownPaperIds = new Set(paperIds);

  for (const [paperIndex, paper] of library.papers.entries()) {
    const paperPath = `library.papers[${paperIndex}]`;
    if (
      paper.origin === 'thesis_ch1_7'
      && (paper.source_in_thesis.length === 0 || paper.bibliography_ref === null)
    ) {
      throw new Error(`Invalid Reading field: ${paperPath}.thesis_provenance`);
    }
    if (paper.origin !== 'thesis_ch1_7' && paper.source_in_thesis.length > 0) {
      throw new Error(`Invalid Reading field: ${paperPath}.supplement_provenance`);
    }
    for (const locator of paper.source_in_thesis) {
      validatePageLocator(locator, `${paperPath}.source_in_thesis`);
    }
  }

  for (const field of ['arxiv', 'doi', 'inspire']) {
    const values = library.papers
      .map((paper) => paper[field]?.trim().toLowerCase())
      .filter(Boolean);
    requireUnique(values, `library.papers.${field}`);
  }

  const edgeIds = relations.edges.map((edge) => edge.id);
  requireUnique(edgeIds, 'relations.edges.id');
  if (new Set([...paperIds, ...edgeIds]).size !== paperIds.length + edgeIds.length) {
    throw new Error('Invalid Reading field: relations.edges.id');
  }
  requireUnique(
    relations.edges.map((edge) => `${edge.source}\u0000${edge.relation}\u0000${edge.target}`),
    'relations.edges triples'
  );

  for (const [edgeIndex, edge] of relations.edges.entries()) {
    const edgePath = `relations.edges[${edgeIndex}]`;
    if (!knownPaperIds.has(edge.source) || !knownPaperIds.has(edge.target) || edge.source === edge.target) {
      throw new Error(`Invalid Reading field: ${edgePath}`);
    }
    if (edge.layer === 'citation' && (edge.relation !== 'cites' || !edge.directed)) {
      throw new Error(`Invalid Reading field: ${edgePath}.citation_direction`);
    }
    if (
      edge.layer === 'curatorial'
      && (edge.relation !== 'curated_connection' || edge.directed || edge.status !== 'proposed')
    ) {
      throw new Error(`Invalid Reading field: ${edgePath}.curatorial_claim`);
    }
    if (
      edge.layer === 'documented_semantic'
      && (
        edge.relation === 'cites'
        || edge.relation === 'curated_connection'
        || !edge.directed
        || edge.confidence !== 'high'
        || edge.status !== 'evidence_checked'
      )
    ) {
      throw new Error(`Invalid Reading field: ${edgePath}.semantic_claim`);
    }
    if (
      edge.layer === 'citation'
      && (edge.confidence !== 'high' || edge.status !== 'evidence_checked')
    ) {
      throw new Error(`Invalid Reading field: ${edgePath}.citation_claim`);
    }
    if (edge.layer === 'curatorial' && edge.confidence !== 'curatorial') {
      throw new Error(`Invalid Reading field: ${edgePath}.curatorial_confidence`);
    }
    if (
      edge.layer !== 'curatorial'
      && !edge.evidence.some((evidence) => evidence.kind === 'primary_source')
    ) {
      throw new Error(`Invalid Reading field: ${edgePath}.evidence`);
    }
    for (const evidence of edge.evidence) {
      if (evidence.kind === 'thesis_context') {
        validatePageLocator(evidence, `${edgePath}.evidence.thesis_context`);
      }
    }
  }

  const threadIds = threads.threads.map((thread) => thread.id);
  requireUnique(threadIds, 'threads.threads.id');
  for (const [threadIndex, thread] of threads.threads.entries()) {
    for (const [stageIndex, stage] of thread.stages.entries()) {
      if (stage.papers.some((paperId) => !knownPaperIds.has(paperId))) {
        throw new Error(`Invalid Reading field: threads.threads[${threadIndex}].stages[${stageIndex}].papers`);
      }
    }
  }

  const graph = viewConfig.graph;
  if (
    graph.initial_focus_ids.some((paperId) => !knownPaperIds.has(paperId))
    || graph.initial_focus_ids.some(
      (paperId) => library.papers.find((paper) => paper.id === paperId).priority < graph.eligible_priority_min
    )
  ) {
    throw new Error('Invalid Reading field: view_config.graph.initial_focus_ids');
  }
  if (graph.default_hops > graph.max_expansion_hops) {
    throw new Error('Invalid Reading field: view_config.graph.default_hops');
  }
  if (graph.curatorial_layer_default || graph.default_layers.includes('curatorial')) {
    throw new Error('Invalid Reading field: view_config.graph.default_layers');
  }
}

export function projectReadingPublicBundle(value, sourceVisibility) {
  const input = record(value, 'bundle');
  const files = {};
  for (const filename of PUBLIC_FILES) {
    files[filename] = projectReadingPublicFile(
      filename,
      required(input, filename, 'bundle'),
      sourceVisibility
    );
  }
  validatePublicBundleInvariants(files);
  return files;
}

export const READING_PUBLIC_DATA_FILES = Object.freeze([...PUBLIC_FILES]);
