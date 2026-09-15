import {
  READING_SCHEMA_VERSION,
  type PaperEntryType,
  type PaperOrigin,
  type PaperRole,
  type PrivateReadingBundle,
  type PrivateReadingLibrary,
  type PrivateReadingPaper,
  type PrivateReadingRelation,
  type PrivateReadingRelations,
  type PrivateReadingThread,
  type PrivateReadingThreads,
  type PrivateReadingViewConfig,
  type ReadingBundle,
  type ReadingLibrary,
  type ReadingPaper,
  type ReadingRelation,
  type ReadingRelations,
  type ReadingSourceDocument,
  type ReadingStatus,
  type ReadingThread,
  type ReadingThreads,
  type ReadingViewConfig,
  type RelationEvidence,
  type RelationLayer,
  type RelationType,
  type ThesisLocator,
} from './types';

export class ReadingDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadingDataError';
  }
}

type JsonRecord = Record<string, unknown>;

const ENTRY_TYPES: PaperEntryType[] = ['article', 'book', 'proceedings', 'preprint'];
const ROLES: PaperRole[] = ['foundation', 'method', 'phenomenology', 'experiment', 'review', 'frontier'];
const ORIGINS: PaperOrigin[] = ['thesis_ch1_7', 'bibliography_only', 'external_supplement'];
const READING_STATUSES: ReadingStatus[] = ['unknown', 'to_read', 'skimmed', 'read', 'deep_read', 'revisit'];
const RELATION_TYPES: RelationType[] = [
  'cites',
  'uses_framework_of',
  'uses_data_from',
  'cross_checks_against',
  'adapts_method_of',
  'updates_software_of',
  'curated_connection',
];
const RELATION_LAYERS: RelationLayer[] = ['citation', 'documented_semantic', 'curatorial'];
const PAPER_ID_PATTERN = /^[a-z][A-Za-z0-9_-]*$/;
const EDGE_ID_PATTERN = /^e[0-9]+$/;

const PRIVATE_LIBRARY_KEYS = [
  'schema_version',
  'visibility',
  'generated_on',
  'curation_notice',
  'source_document',
  'papers',
] as const;
const PUBLIC_LIBRARY_KEYS = ['schema_version', 'visibility', 'papers'] as const;
const PUBLIC_PAPER_KEYS = [
  'id',
  'title',
  'authors',
  'authors_complete',
  'collaboration',
  'year',
  'preprint_year',
  'journal',
  'arxiv',
  'doi',
  'inspire',
  'entry_type',
  'role',
  'topics',
  'processes',
  'priority',
  'priority_basis',
  'reading_status',
  'curation_status',
  'origin',
  'bibliography_ref',
  'raw_thesis_citation',
  'why_it_matters',
  'research_connection',
  'annotation_author',
  'source_in_thesis',
  'verification',
  'personal_notes',
  'idea_hooks',
] as const;
const PRIVATE_PAPER_KEYS = [...PUBLIC_PAPER_KEYS, 'visibility'] as const;
const LOCATOR_KEYS = ['chapter', 'section', 'printed_pages', 'pdf_pages', 'purpose'] as const;
const SOURCE_DOCUMENT_KEYS = ['id', 'filename', 'sha256', 'body_scope', 'bibliography_lookup', 'page_numbering'] as const;
const VERIFICATION_KEYS = ['identity_status', 'checked_on', 'content_basis', 'sources', 'notes'] as const;
const VERIFICATION_SOURCE_KEYS = ['kind', 'url', 'locator'] as const;
const PRIVATE_RELATIONS_KEYS = [
  'schema_version',
  'visibility',
  'generated_on',
  'direction_rule',
  'epistemic_warning',
  'edges',
  'hypothesis_edges',
] as const;
const PUBLIC_RELATIONS_KEYS = ['schema_version', 'visibility', 'edges'] as const;
const PUBLIC_EDGE_KEYS = [
  'id',
  'source',
  'target',
  'relation',
  'layer',
  'directed',
  'note',
  'evidence',
  'confidence',
  'status',
] as const;
const PRIVATE_EDGE_KEYS = [...PUBLIC_EDGE_KEYS, 'visibility'] as const;
const PRIMARY_EVIDENCE_KEYS = ['kind', 'url', 'locator', 'checked_on'] as const;
const THESIS_EVIDENCE_KEYS = [
  'kind',
  'document_id',
  'chapter',
  'section',
  'printed_pages',
  'pdf_pages',
] as const;
const PUBLIC_THESIS_EVIDENCE_KEYS = ['kind', 'chapter', 'section', 'printed_pages', 'pdf_pages'] as const;
const PRIVATE_THREADS_KEYS = ['schema_version', 'visibility', 'generated_on', 'threads'] as const;
const PUBLIC_THREADS_KEYS = ['schema_version', 'visibility', 'threads'] as const;
const PUBLIC_THREAD_KEYS = [
  'id',
  'title',
  'annotation_author',
  'status',
  'summary',
  'thesis_chapters',
  'stages',
  'reading_question',
] as const;
const PRIVATE_THREAD_KEYS = [...PUBLIC_THREAD_KEYS, 'visibility', 'question_status'] as const;
const STAGE_KEYS = ['label', 'papers', 'narrative'] as const;
const PRIVATE_VIEW_CONFIG_KEYS = [
  'schema_version',
  'visibility',
  'default_view',
  'graph',
  'public_seed_export_enabled',
  'weekly_agent_enabled',
  'web_editing_enabled',
] as const;
const PRIVATE_VIEW_GRAPH_KEYS = [
  'eligible_priority_min',
  'initial_node_limit',
  'initial_focus_ids',
  'default_layers',
  'curatorial_layer_default',
  'hypothesis_layer_default',
  'default_hops',
  'max_expansion_hops',
] as const;
const PUBLIC_VIEW_CONFIG_KEYS = ['schema_version', 'visibility', 'default_view', 'graph'] as const;
const PUBLIC_VIEW_GRAPH_KEYS = [
  'eligible_priority_min',
  'initial_focus_ids',
  'default_layers',
  'curatorial_layer_default',
  'default_hops',
  'max_expansion_hops',
] as const;

function invalid(path: string): never {
  throw new ReadingDataError(`数据字段无效：${path}`);
}

function object(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) invalid(`${path}.${key}`);
  }
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path);
  return value;
}

function string(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) invalid(path);
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  // Nullable metadata fields intentionally follow the JSON Schema and may be
  // empty; UI adapters treat empty identifiers as unavailable links.
  if (typeof value !== 'string') invalid(path);
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') invalid(path);
  return value;
}

function date(value: unknown, path: string): string {
  const result = string(value, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  if (!match) invalid(path);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // setUTCFullYear avoids Date.UTC's special 1900 offset for years 00-99.
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    invalid(path);
  }
  return result;
}

function uri(value: unknown, path: string): string {
  const result = string(value, path);
  if (/[%](?![0-9a-f]{2})/i.test(result) || /[\u0000-\u0020<>"`]/.test(result)) invalid(path);
  try {
    const parsed = new URL(result);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      || parsed.username !== ''
      || parsed.password !== ''
    ) invalid(path);
  } catch {
    invalid(path);
  }
  return result;
}

function paperId(value: unknown, path: string): string {
  const result = string(value, path);
  if (!PAPER_ID_PATTERN.test(result)) invalid(path);
  return result;
}

function edgeId(value: unknown, path: string): string {
  const result = string(value, path);
  if (!EDGE_ID_PATTERN.test(result)) invalid(path);
  return result;
}

function sha256(value: unknown, path: string): string {
  const result = string(value, path);
  if (!/^[a-f0-9]{64}$/.test(result)) invalid(path);
  return result;
}

function integer(value: unknown, path: string, min?: number, max?: number): number {
  if (!Number.isInteger(value)) invalid(path);
  const result = value as number;
  if ((min !== undefined && result < min) || (max !== undefined && result > max)) invalid(path);
  return result;
}

function nullableInteger(value: unknown, path: string, min?: number): number | null {
  if (value === null) return null;
  return integer(value, path, min);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) invalid(path);
  return value as T;
}

function disabled(value: unknown, path: string): false {
  if (value !== false) invalid(path);
  return false;
}

function stringList(
  value: unknown,
  path: string,
  options: { minItems?: number; uniqueItems?: boolean; allowEmptyItems?: boolean } = {}
): string[] {
  const values = array(value, path).map((item, index) =>
    string(item, `${path}[${index}]`, options.allowEmptyItems ?? false)
  );
  if (options.minItems !== undefined && values.length < options.minItems) invalid(path);
  if (options.uniqueItems) unique(values, path);
  return values;
}

function integerList(
  value: unknown,
  path: string,
  options: { itemMin?: number; itemMax?: number; minItems?: number; uniqueItems?: boolean } = {}
): number[] {
  const values = array(value, path).map((item, index) =>
    integer(item, `${path}[${index}]`, options.itemMin, options.itemMax)
  );
  if (options.minItems !== undefined && values.length < options.minItems) invalid(path);
  if (options.uniqueItems && new Set(values).size !== values.length) invalid(path);
  return values;
}

function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) invalid(path);
}

function parseLocator(value: unknown, path: string): ThesisLocator {
  const item = object(value, path);
  exactKeys(item, LOCATOR_KEYS, path);
  return {
    chapter: integer(item.chapter, `${path}.chapter`, 1, 7),
    section: string(item.section, `${path}.section`),
    printed_pages: integerList(item.printed_pages, `${path}.printed_pages`, {
      itemMin: 1,
      minItems: 1,
      uniqueItems: true,
    }),
    pdf_pages: integerList(item.pdf_pages, `${path}.pdf_pages`, {
      itemMin: 1,
      minItems: 1,
      uniqueItems: true,
    }),
    purpose: string(item.purpose, `${path}.purpose`),
  };
}

type VisibilityMode = 'private' | 'public';

function parsePaper(value: unknown, index: number, mode: VisibilityMode): ReadingPaper | PrivateReadingPaper {
  const path = `library.papers[${index}]`;
  const item = object(value, path);
  const verification = object(item.verification, `${path}.verification`);
  exactKeys(item, mode === 'public' ? PUBLIC_PAPER_KEYS : PRIVATE_PAPER_KEYS, path);
  exactKeys(verification, VERIFICATION_KEYS, `${path}.verification`);
  const sources = array(verification.sources, `${path}.verification.sources`);
  if (sources.length === 0) invalid(`${path}.verification.sources`);

  const paper: ReadingPaper = {
    id: paperId(item.id, `${path}.id`),
    title: string(item.title, `${path}.title`),
    authors: stringList(item.authors, `${path}.authors`, { minItems: 1 }),
    authors_complete: boolean(item.authors_complete, `${path}.authors_complete`),
    collaboration: nullableString(item.collaboration, `${path}.collaboration`),
    year: integer(item.year, `${path}.year`, 1900, 2200),
    preprint_year: nullableInteger(item.preprint_year, `${path}.preprint_year`),
    journal: nullableString(item.journal, `${path}.journal`),
    arxiv: nullableString(item.arxiv, `${path}.arxiv`),
    doi: nullableString(item.doi, `${path}.doi`),
    inspire: nullableString(item.inspire, `${path}.inspire`),
    entry_type: oneOf(item.entry_type, ENTRY_TYPES, `${path}.entry_type`),
    role: oneOf(item.role, ROLES, `${path}.role`),
    topics: stringList(item.topics, `${path}.topics`, { uniqueItems: true }),
    processes: stringList(item.processes, `${path}.processes`, { uniqueItems: true }),
    priority: integer(item.priority, `${path}.priority`, 1, 5),
    priority_basis: oneOf(
      item.priority_basis,
      ['assistant_proposed_curatorial_relevance', 'user_confirmed'],
      `${path}.priority_basis`
    ),
    reading_status: oneOf(item.reading_status, READING_STATUSES, `${path}.reading_status`),
    curation_status: oneOf(item.curation_status, ['proposed', 'accepted', 'archived'], `${path}.curation_status`),
    origin: oneOf(item.origin, ORIGINS, `${path}.origin`),
    bibliography_ref: nullableInteger(item.bibliography_ref, `${path}.bibliography_ref`, 1),
    raw_thesis_citation: nullableString(item.raw_thesis_citation, `${path}.raw_thesis_citation`),
    why_it_matters: string(item.why_it_matters, `${path}.why_it_matters`),
    research_connection: string(item.research_connection, `${path}.research_connection`),
    annotation_author: oneOf(item.annotation_author, ['assistant', 'user'], `${path}.annotation_author`),
    source_in_thesis: array(item.source_in_thesis, `${path}.source_in_thesis`).map((locator, locatorIndex) =>
      parseLocator(locator, `${path}.source_in_thesis[${locatorIndex}]`)
    ),
    verification: {
      identity_status: oneOf(
        verification.identity_status,
        ['primary_record_checked', 'thesis_only', 'needs_review'],
        `${path}.verification.identity_status`
      ),
      checked_on: date(verification.checked_on, `${path}.verification.checked_on`),
      content_basis: string(verification.content_basis, `${path}.verification.content_basis`),
      sources: sources.map((source, sourceIndex) => {
        const sourcePath = `${path}.verification.sources[${sourceIndex}]`;
        const record = object(source, sourcePath);
        exactKeys(record, VERIFICATION_SOURCE_KEYS, sourcePath);
        return {
          kind: string(record.kind, `${sourcePath}.kind`),
          url: uri(record.url, `${sourcePath}.url`),
          locator: string(record.locator, `${sourcePath}.locator`),
        };
      }),
      notes: stringList(verification.notes, `${path}.verification.notes`),
    },
    personal_notes: string(item.personal_notes, `${path}.personal_notes`, true),
    idea_hooks: stringList(item.idea_hooks, `${path}.idea_hooks`),
  };
  if (mode === 'public') return paper;
  return { ...paper, visibility: oneOf(item.visibility, ['private'], `${path}.visibility`) };
}

function parseLibrary(value: unknown, mode: 'public'): ReadingLibrary;
function parseLibrary(value: unknown, mode: 'private'): PrivateReadingLibrary;
function parseLibrary(value: unknown, mode: VisibilityMode): ReadingLibrary | PrivateReadingLibrary {
  const item = object(value, 'library');
  exactKeys(item, mode === 'public' ? PUBLIC_LIBRARY_KEYS : PRIVATE_LIBRARY_KEYS, 'library');
  const papers = array(item.papers, 'library.papers').map((paper, index) => parsePaper(paper, index, mode));
  if (papers.length === 0) invalid('library.papers');

  const schemaVersion = oneOf(item.schema_version, [READING_SCHEMA_VERSION], 'library.schema_version');
  if (mode === 'public') {
    return {
      schema_version: schemaVersion,
      visibility: oneOf(item.visibility, ['public'], 'library.visibility'),
      papers: papers as ReadingPaper[],
    };
  }

  const sourceDocumentRecord = object(item.source_document, 'library.source_document');
  exactKeys(sourceDocumentRecord, SOURCE_DOCUMENT_KEYS, 'library.source_document');
  const sourceDocument: ReadingSourceDocument = {
    id: string(sourceDocumentRecord.id, 'library.source_document.id'),
    filename: string(sourceDocumentRecord.filename, 'library.source_document.filename'),
    sha256: sha256(sourceDocumentRecord.sha256, 'library.source_document.sha256'),
    body_scope: object(sourceDocumentRecord.body_scope, 'library.source_document.body_scope'),
    bibliography_lookup: object(sourceDocumentRecord.bibliography_lookup, 'library.source_document.bibliography_lookup'),
    page_numbering: string(sourceDocumentRecord.page_numbering, 'library.source_document.page_numbering'),
  };
  return {
    schema_version: schemaVersion,
    visibility: oneOf(item.visibility, ['private'], 'library.visibility'),
    generated_on: date(item.generated_on, 'library.generated_on'),
    curation_notice: string(item.curation_notice, 'library.curation_notice'),
    source_document: sourceDocument,
    papers: papers as PrivateReadingPaper[],
  };
}

function parseEvidence(
  value: unknown,
  path: string,
  mode: VisibilityMode
): RelationEvidence | PrivateReadingRelation['evidence'][number] {
  const item = object(value, path);
  const kind = oneOf(item.kind, ['primary_source', 'thesis_context'], `${path}.kind`);
  if (kind === 'primary_source') {
    exactKeys(item, PRIMARY_EVIDENCE_KEYS, path);
    return {
      kind,
      url: uri(item.url, `${path}.url`),
      locator: string(item.locator, `${path}.locator`),
      checked_on: date(item.checked_on, `${path}.checked_on`),
    };
  }

  exactKeys(item, mode === 'public' ? PUBLIC_THESIS_EVIDENCE_KEYS : THESIS_EVIDENCE_KEYS, path);
  const evidence = {
    kind,
    chapter: integer(item.chapter, `${path}.chapter`, 1, 7),
    section: string(item.section, `${path}.section`),
    printed_pages: integerList(item.printed_pages, `${path}.printed_pages`, {
      itemMin: 1,
      minItems: 1,
      uniqueItems: true,
    }),
    pdf_pages: integerList(item.pdf_pages, `${path}.pdf_pages`, {
      itemMin: 1,
      minItems: 1,
      uniqueItems: true,
    }),
  };
  if (mode === 'public') return evidence;
  return { ...evidence, document_id: string(item.document_id, `${path}.document_id`) };
}

function parseRelation(
  value: unknown,
  index: number,
  mode: VisibilityMode
): ReadingRelation | PrivateReadingRelation {
  const path = `relations.edges[${index}]`;
  const item = object(value, path);
  exactKeys(item, mode === 'public' ? PUBLIC_EDGE_KEYS : PRIVATE_EDGE_KEYS, path);
  const evidence = array(item.evidence, `${path}.evidence`).map((entry, evidenceIndex) =>
    parseEvidence(entry, `${path}.evidence[${evidenceIndex}]`, mode)
  );
  if (evidence.length === 0) invalid(`${path}.evidence`);

  const relation: ReadingRelation = {
    id: edgeId(item.id, `${path}.id`),
    source: paperId(item.source, `${path}.source`),
    target: paperId(item.target, `${path}.target`),
    relation: oneOf(item.relation, RELATION_TYPES, `${path}.relation`),
    layer: oneOf(item.layer, RELATION_LAYERS, `${path}.layer`),
    directed: boolean(item.directed, `${path}.directed`),
    note: string(item.note, `${path}.note`),
    evidence: evidence as RelationEvidence[],
    confidence: oneOf(item.confidence, ['high', 'curatorial'], `${path}.confidence`),
    status: oneOf(item.status, ['evidence_checked', 'proposed'], `${path}.status`),
  };
  if (mode === 'public') return relation;
  return {
    ...relation,
    evidence: evidence as PrivateReadingRelation['evidence'],
    visibility: oneOf(item.visibility, ['private'], `${path}.visibility`),
  };
}

function parseRelations(value: unknown, mode: 'public'): ReadingRelations;
function parseRelations(value: unknown, mode: 'private'): PrivateReadingRelations;
function parseRelations(value: unknown, mode: VisibilityMode): ReadingRelations | PrivateReadingRelations {
  const item = object(value, 'relations');
  exactKeys(item, mode === 'public' ? PUBLIC_RELATIONS_KEYS : PRIVATE_RELATIONS_KEYS, 'relations');
  const schemaVersion = oneOf(item.schema_version, [READING_SCHEMA_VERSION], 'relations.schema_version');
  const edges = array(item.edges, 'relations.edges').map((edge, index) => parseRelation(edge, index, mode));
  if (mode === 'public') {
    return {
      schema_version: schemaVersion,
      visibility: oneOf(item.visibility, ['public'], 'relations.visibility'),
      edges: edges as ReadingRelation[],
    };
  }
  const hypothesisEdges = array(item.hypothesis_edges, 'relations.hypothesis_edges');
  if (hypothesisEdges.length !== 0) invalid('relations.hypothesis_edges');
  return {
    schema_version: schemaVersion,
    visibility: oneOf(item.visibility, ['private'], 'relations.visibility'),
    generated_on: date(item.generated_on, 'relations.generated_on'),
    direction_rule: string(item.direction_rule, 'relations.direction_rule'),
    epistemic_warning: string(item.epistemic_warning, 'relations.epistemic_warning'),
    edges: edges as PrivateReadingRelation[],
    hypothesis_edges: [],
  };
}

function parseThread(value: unknown, index: number, mode: VisibilityMode): ReadingThread | PrivateReadingThread {
  const path = `threads.threads[${index}]`;
  const item = object(value, path);
  exactKeys(item, mode === 'public' ? PUBLIC_THREAD_KEYS : PRIVATE_THREAD_KEYS, path);
  const stages = array(item.stages, `${path}.stages`).map((stage, stageIndex) => {
    const stagePath = `${path}.stages[${stageIndex}]`;
    const record = object(stage, stagePath);
    exactKeys(record, STAGE_KEYS, stagePath);
    return {
      label: string(record.label, `${stagePath}.label`),
      papers: stringList(record.papers, `${stagePath}.papers`, { uniqueItems: true }).map((id, paperIndex) =>
        paperId(id, `${stagePath}.papers[${paperIndex}]`)
      ),
      narrative: string(record.narrative, `${stagePath}.narrative`),
    };
  });
  if (stages.length === 0) invalid(`${path}.stages`);

  const thread: ReadingThread = {
    id: string(item.id, `${path}.id`),
    title: string(item.title, `${path}.title`),
    annotation_author: oneOf(item.annotation_author, ['assistant', 'user'], `${path}.annotation_author`),
    status: oneOf(item.status, ['proposed', 'accepted'], `${path}.status`),
    summary: string(item.summary, `${path}.summary`),
    thesis_chapters: integerList(item.thesis_chapters, `${path}.thesis_chapters`, {
      itemMin: 1,
      itemMax: 7,
      uniqueItems: true,
    }),
    stages,
    reading_question: string(item.reading_question, `${path}.reading_question`),
  };
  if (mode === 'public') return thread;
  return {
    ...thread,
    visibility: oneOf(item.visibility, ['private'], `${path}.visibility`),
    question_status: oneOf(
      item.question_status,
      ['reading_prompt_not_verified_research_gap'],
      `${path}.question_status`
    ),
  };
}

function parseThreads(value: unknown, mode: 'public'): ReadingThreads;
function parseThreads(value: unknown, mode: 'private'): PrivateReadingThreads;
function parseThreads(value: unknown, mode: VisibilityMode): ReadingThreads | PrivateReadingThreads {
  const item = object(value, 'threads');
  exactKeys(item, mode === 'public' ? PUBLIC_THREADS_KEYS : PRIVATE_THREADS_KEYS, 'threads');
  const threads = array(item.threads, 'threads.threads').map((thread, index) => parseThread(thread, index, mode));
  if (threads.length === 0) invalid('threads.threads');
  const schemaVersion = oneOf(item.schema_version, [READING_SCHEMA_VERSION], 'threads.schema_version');
  if (mode === 'public') {
    return {
      schema_version: schemaVersion,
      visibility: oneOf(item.visibility, ['public'], 'threads.visibility'),
      threads: threads as ReadingThread[],
    };
  }
  return {
    schema_version: schemaVersion,
    visibility: oneOf(item.visibility, ['private'], 'threads.visibility'),
    generated_on: date(item.generated_on, 'threads.generated_on'),
    threads: threads as PrivateReadingThread[],
  };
}

function parseViewConfig(value: unknown, mode: 'public'): ReadingViewConfig;
function parseViewConfig(value: unknown, mode: 'private'): PrivateReadingViewConfig;
function parseViewConfig(value: unknown, mode: VisibilityMode): ReadingViewConfig | PrivateReadingViewConfig {
  const item = object(value, 'view_config');
  const graph = object(item.graph, 'view_config.graph');
  exactKeys(item, mode === 'public' ? PUBLIC_VIEW_CONFIG_KEYS : PRIVATE_VIEW_CONFIG_KEYS, 'view_config');
  exactKeys(graph, mode === 'public' ? PUBLIC_VIEW_GRAPH_KEYS : PRIVATE_VIEW_GRAPH_KEYS, 'view_config.graph');
  const defaultLayers = array(graph.default_layers, 'view_config.graph.default_layers').map((layer, index) =>
    oneOf(layer, RELATION_LAYERS, `view_config.graph.default_layers[${index}]`)
  );
  if (defaultLayers.length === 0) invalid('view_config.graph.default_layers');
  unique(defaultLayers, 'view_config.graph.default_layers');
  const initialFocusIds = stringList(graph.initial_focus_ids, 'view_config.graph.initial_focus_ids', {
    minItems: 1,
    uniqueItems: true,
  }).map((id, index) => paperId(id, `view_config.graph.initial_focus_ids[${index}]`));

  const schemaVersion = oneOf(item.schema_version, [READING_SCHEMA_VERSION], 'view_config.schema_version');
  const defaultView = oneOf(item.default_view, ['library', 'map', 'threads'], 'view_config.default_view');
  const publicGraph = {
    eligible_priority_min: integer(graph.eligible_priority_min, 'view_config.graph.eligible_priority_min', 1, 5),
    initial_focus_ids: initialFocusIds,
    default_layers: defaultLayers,
    curatorial_layer_default: boolean(graph.curatorial_layer_default, 'view_config.graph.curatorial_layer_default'),
    default_hops: integer(graph.default_hops, 'view_config.graph.default_hops', 0, 2),
    max_expansion_hops: integer(graph.max_expansion_hops, 'view_config.graph.max_expansion_hops', 1, 2),
  };
  if (mode === 'public') {
    return {
      schema_version: schemaVersion,
      visibility: oneOf(item.visibility, ['public'], 'view_config.visibility'),
      default_view: defaultView,
      graph: publicGraph,
    };
  }

  return {
    schema_version: schemaVersion,
    visibility: oneOf(item.visibility, ['private'], 'view_config.visibility'),
    default_view: defaultView,
    graph: {
      ...publicGraph,
      initial_node_limit: integer(graph.initial_node_limit, 'view_config.graph.initial_node_limit', 1),
      hypothesis_layer_default: boolean(graph.hypothesis_layer_default, 'view_config.graph.hypothesis_layer_default'),
    },
    public_seed_export_enabled: disabled(item.public_seed_export_enabled, 'view_config.public_seed_export_enabled'),
    weekly_agent_enabled: disabled(item.weekly_agent_enabled, 'view_config.weekly_agent_enabled'),
    web_editing_enabled: disabled(item.web_editing_enabled, 'view_config.web_editing_enabled'),
  };
}

function validateInvariants(bundle: ReadingBundle | PrivateReadingBundle): void {
  const visibility = bundle.library.visibility;
  if (bundle.relations.visibility !== visibility) invalid('relations.visibility');
  if (bundle.threads.visibility !== visibility) invalid('threads.visibility');
  if (bundle.viewConfig.visibility !== visibility) invalid('view_config.visibility');

  const paperIds = bundle.library.papers.map((paper) => paper.id);
  unique(paperIds, 'library.papers.id');
  const knownPaperIds = new Set(paperIds);
  const sourceDocumentId = visibility === 'private'
    ? (bundle.library as PrivateReadingLibrary).source_document.id
    : null;
  const chapterRanges: Record<number, [number, number]> = {
    1: [1, 3],
    2: [4, 10],
    3: [11, 38],
    4: [39, 66],
    5: [67, 70],
    6: [71, 85],
    7: [86, 95],
  };

  for (const [paperIndex, paper] of bundle.library.papers.entries()) {
    const paperPath = `library.papers[${paperIndex}]`;
    if (
      paper.origin === 'thesis_ch1_7' &&
      (paper.source_in_thesis.length === 0 || paper.bibliography_ref === null)
    ) {
      invalid(`${paperPath}.thesis_provenance`);
    }
    if (paper.origin !== 'thesis_ch1_7' && paper.source_in_thesis.length > 0) {
      invalid(`${paperPath}.supplement_provenance`);
    }
    for (const locator of paper.source_in_thesis) {
      const [minimum, maximum] = chapterRanges[locator.chapter];
      if (
        locator.printed_pages.some((page) => page < minimum || page > maximum) ||
        locator.pdf_pages.length !== locator.printed_pages.length ||
        locator.pdf_pages.some((page, index) => page !== locator.printed_pages[index] + 13)
      ) {
        invalid(`${paperPath}.source_in_thesis`);
      }
    }
  }

  for (const identifier of ['arxiv', 'doi', 'inspire'] as const) {
    const values = bundle.library.papers
      .map((paper) => paper[identifier]?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value));
    unique(values, `library.papers.${identifier}`);
  }

  const edgeIds = bundle.relations.edges.map((edge) => edge.id);
  unique(edgeIds, 'relations.edges.id');
  if (new Set([...paperIds, ...edgeIds]).size !== paperIds.length + edgeIds.length) {
    // Cytoscape uses one shared element-ID namespace for nodes and edges.
    invalid('relations.edges.id');
  }
  unique(
    bundle.relations.edges.map((edge) => `${edge.source}\u0000${edge.relation}\u0000${edge.target}`),
    'relations.edges triples'
  );

  for (const [edgeIndex, edge] of bundle.relations.edges.entries()) {
    const edgePath = `relations.edges[${edgeIndex}]`;
    if (!knownPaperIds.has(edge.source) || !knownPaperIds.has(edge.target) || edge.source === edge.target) {
      invalid(edgePath);
    }
    if (edge.layer === 'citation' && (edge.relation !== 'cites' || !edge.directed)) {
      invalid(`${edgePath}.citation_direction`);
    }
    if (
      edge.layer === 'curatorial' &&
      (edge.relation !== 'curated_connection' || edge.directed || edge.status !== 'proposed')
    ) {
      invalid(`${edgePath}.curatorial_claim`);
    }
    if (
      edge.layer === 'documented_semantic' &&
      (edge.relation === 'cites' ||
        edge.relation === 'curated_connection' ||
        !edge.directed ||
        edge.confidence !== 'high' ||
        edge.status !== 'evidence_checked')
    ) {
      invalid(`${edgePath}.semantic_claim`);
    }
    if (
      edge.layer === 'citation' &&
      (edge.confidence !== 'high' || edge.status !== 'evidence_checked')
    ) {
      invalid(`${edgePath}.citation_claim`);
    }
    if (edge.layer === 'curatorial' && edge.confidence !== 'curatorial') {
      invalid(`${edgePath}.curatorial_confidence`);
    }
    if (
      edge.layer !== 'curatorial' &&
      !edge.evidence.some((evidence) => evidence.kind === 'primary_source')
    ) {
      invalid(`${edgePath}.evidence`);
    }
    for (const evidence of edge.evidence) {
      if (evidence.kind !== 'thesis_context') continue;
      const [minimum, maximum] = chapterRanges[evidence.chapter];
      if (
        (sourceDocumentId !== null && (!('document_id' in evidence) || evidence.document_id !== sourceDocumentId)) ||
        evidence.printed_pages.some((page) => page < minimum || page > maximum) ||
        evidence.pdf_pages.length !== evidence.printed_pages.length ||
        evidence.pdf_pages.some((page, index) => page !== evidence.printed_pages[index] + 13)
      ) {
        invalid(`${edgePath}.evidence.thesis_context`);
      }
    }
  }

  const threadIds = bundle.threads.threads.map((thread) => thread.id);
  unique(threadIds, 'threads.threads.id');
  for (const [threadIndex, thread] of bundle.threads.threads.entries()) {
    for (const [stageIndex, stage] of thread.stages.entries()) {
      if (stage.papers.some((paperId) => !knownPaperIds.has(paperId))) {
        invalid(`threads.threads[${threadIndex}].stages[${stageIndex}].papers`);
      }
    }
  }

  if (bundle.viewConfig.graph.initial_focus_ids.some((paperId) => !knownPaperIds.has(paperId))) {
    invalid('view_config.graph.initial_focus_ids');
  }
  if (
    (visibility === 'private' && bundle.viewConfig.graph.initial_focus_ids.length >
      (bundle.viewConfig as PrivateReadingViewConfig).graph.initial_node_limit) ||
    bundle.viewConfig.graph.initial_focus_ids.some(
      (paperId) =>
        (bundle.library.papers.find((paper) => paper.id === paperId)?.priority ?? 0) <
        bundle.viewConfig.graph.eligible_priority_min
    )
  ) {
    invalid('view_config.graph.initial_focus_ids');
  }
  if (bundle.viewConfig.graph.default_hops > bundle.viewConfig.graph.max_expansion_hops) {
    invalid('view_config.graph.default_hops');
  }
  if (
    bundle.viewConfig.graph.curatorial_layer_default ||
    (visibility === 'private' && (bundle.viewConfig as PrivateReadingViewConfig).graph.hypothesis_layer_default) ||
    bundle.viewConfig.graph.default_layers.includes('curatorial')
  ) {
    invalid('view_config.graph.default_layers');
  }
}

export function validateReadingBundle(input: {
  library: unknown;
  relations: unknown;
  threads: unknown;
  viewConfig: unknown;
}): ReadingBundle {
  const bundle: ReadingBundle = {
    library: parseLibrary(input.library, 'public'),
    relations: parseRelations(input.relations, 'public'),
    threads: parseThreads(input.threads, 'public'),
    viewConfig: parseViewConfig(input.viewConfig, 'public'),
  };
  validateInvariants(bundle);
  return bundle;
}

export function validatePrivateReadingBundle(input: {
  library: unknown;
  relations: unknown;
  threads: unknown;
  viewConfig: unknown;
}): PrivateReadingBundle {
  const bundle: PrivateReadingBundle = {
    library: parseLibrary(input.library, 'private'),
    relations: parseRelations(input.relations, 'private'),
    threads: parseThreads(input.threads, 'private'),
    viewConfig: parseViewConfig(input.viewConfig, 'private'),
  };
  validateInvariants(bundle);
  return bundle;
}
