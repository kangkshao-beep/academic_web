export type SearchDocumentKind = 'page' | 'pdf';

export interface SearchDocument {
  id: string;
  canonicalId: string;
  locale: string;
  kind: SearchDocumentKind;
  title: string;
  section: string;
  source: string;
  href: string;
  body: string;
  page?: number;
  version?: string;
}

export interface SearchIndex {
  version: number;
  generatedAt: string;
  documents: SearchDocument[];
}
