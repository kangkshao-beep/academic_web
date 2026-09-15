export const READING_SCHEMA_VERSION = '1.0.0' as const;

export type ReadingStatus =
  | 'unknown'
  | 'to_read'
  | 'skimmed'
  | 'read'
  | 'deep_read'
  | 'revisit';

export type PaperRole =
  | 'foundation'
  | 'method'
  | 'phenomenology'
  | 'experiment'
  | 'review'
  | 'frontier';

export type PaperOrigin =
  | 'thesis_ch1_7'
  | 'bibliography_only'
  | 'external_supplement';

export type PaperEntryType = 'article' | 'book' | 'proceedings' | 'preprint';

export interface ThesisLocator {
  chapter: number;
  section: string;
  printed_pages: number[];
  pdf_pages: number[];
  purpose: string;
}

export interface VerificationSource {
  kind: string;
  url: string;
  locator: string;
}

export interface PaperVerification {
  identity_status: 'primary_record_checked' | 'thesis_only' | 'needs_review';
  checked_on: string;
  content_basis: string;
  sources: VerificationSource[];
  notes: string[];
}

export interface ReadingPaper {
  id: string;
  title: string;
  authors: string[];
  authors_complete: boolean;
  collaboration: string | null;
  year: number;
  preprint_year: number | null;
  journal: string | null;
  arxiv: string | null;
  doi: string | null;
  inspire: string | null;
  entry_type: PaperEntryType;
  role: PaperRole;
  topics: string[];
  processes: string[];
  priority: number;
  priority_basis: 'assistant_proposed_curatorial_relevance' | 'user_confirmed';
  reading_status: ReadingStatus;
  curation_status: 'proposed' | 'accepted' | 'archived';
  origin: PaperOrigin;
  bibliography_ref: number | null;
  raw_thesis_citation: string | null;
  why_it_matters: string;
  research_connection: string;
  annotation_author: 'assistant' | 'user';
  source_in_thesis: ThesisLocator[];
  verification: PaperVerification;
  personal_notes: string;
  idea_hooks: string[];
}

export interface ReadingLibrary {
  schema_version: typeof READING_SCHEMA_VERSION;
  visibility: 'public';
  papers: ReadingPaper[];
}

export interface PrivateReadingPaper extends ReadingPaper {
  visibility: 'private';
}

export interface PrivateReadingLibrary {
  schema_version: typeof READING_SCHEMA_VERSION;
  visibility: 'private';
  generated_on: string;
  curation_notice: string;
  source_document: ReadingSourceDocument;
  papers: PrivateReadingPaper[];
}

export interface ReadingSourceDocument {
  id: string;
  filename: string;
  sha256: string;
  body_scope: Record<string, unknown>;
  bibliography_lookup: Record<string, unknown>;
  page_numbering: string;
}

export type RelationType =
  | 'cites'
  | 'uses_framework_of'
  | 'uses_data_from'
  | 'cross_checks_against'
  | 'adapts_method_of'
  | 'updates_software_of'
  | 'curated_connection';

export type RelationLayer = 'citation' | 'documented_semantic' | 'curatorial';

export interface PrimarySourceEvidence {
  kind: 'primary_source';
  url: string;
  locator: string;
  checked_on: string;
}

export interface ThesisContextEvidence {
  kind: 'thesis_context';
  chapter: number;
  section: string;
  printed_pages: number[];
  pdf_pages: number[];
}

export interface PrivateThesisContextEvidence extends ThesisContextEvidence {
  document_id: string;
}

export type RelationEvidence = PrimarySourceEvidence | ThesisContextEvidence;

export interface ReadingRelation {
  id: string;
  source: string;
  target: string;
  relation: RelationType;
  layer: RelationLayer;
  directed: boolean;
  note: string;
  evidence: RelationEvidence[];
  confidence: 'high' | 'curatorial';
  status: 'evidence_checked' | 'proposed';
}

export interface ReadingRelations {
  schema_version: typeof READING_SCHEMA_VERSION;
  visibility: 'public';
  edges: ReadingRelation[];
}

export interface PrivateReadingRelation extends Omit<ReadingRelation, 'evidence'> {
  evidence: Array<PrimarySourceEvidence | PrivateThesisContextEvidence>;
  visibility: 'private';
}

export interface PrivateReadingRelations {
  schema_version: typeof READING_SCHEMA_VERSION;
  visibility: 'private';
  generated_on: string;
  direction_rule: string;
  epistemic_warning: string;
  edges: PrivateReadingRelation[];
  hypothesis_edges: [];
}

export interface ReadingThreadStage {
  label: string;
  papers: string[];
  narrative: string;
}

export interface ReadingThread {
  id: string;
  title: string;
  annotation_author: 'assistant' | 'user';
  status: 'proposed' | 'accepted';
  summary: string;
  thesis_chapters: number[];
  stages: ReadingThreadStage[];
  reading_question: string;
}

export interface ReadingThreads {
  schema_version: typeof READING_SCHEMA_VERSION;
  visibility: 'public';
  threads: ReadingThread[];
}

export interface PrivateReadingThread extends ReadingThread {
  visibility: 'private';
  question_status: 'reading_prompt_not_verified_research_gap';
}

export interface PrivateReadingThreads {
  schema_version: typeof READING_SCHEMA_VERSION;
  visibility: 'private';
  generated_on: string;
  threads: PrivateReadingThread[];
}

export interface ReadingGraphConfig {
  eligible_priority_min: number;
  initial_focus_ids: string[];
  default_layers: RelationLayer[];
  curatorial_layer_default: boolean;
  default_hops: number;
  max_expansion_hops: number;
}

export interface ReadingViewConfig {
  schema_version: typeof READING_SCHEMA_VERSION;
  visibility: 'public';
  default_view: 'library' | 'map' | 'threads';
  graph: ReadingGraphConfig;
}

export interface PrivateReadingViewConfig {
  schema_version: typeof READING_SCHEMA_VERSION;
  visibility: 'private';
  default_view: 'library' | 'map' | 'threads';
  graph: ReadingGraphConfig & {
    initial_node_limit: number;
    hypothesis_layer_default: boolean;
  };
  public_seed_export_enabled: false;
  weekly_agent_enabled: false;
  web_editing_enabled: false;
}

export interface ReadingBundle {
  library: ReadingLibrary;
  relations: ReadingRelations;
  threads: ReadingThreads;
  viewConfig: ReadingViewConfig;
}

export interface PrivateReadingBundle {
  library: PrivateReadingLibrary;
  relations: PrivateReadingRelations;
  threads: PrivateReadingThreads;
  viewConfig: PrivateReadingViewConfig;
}

export type ReadingTab = 'library' | 'map' | 'threads';
