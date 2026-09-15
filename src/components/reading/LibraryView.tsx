'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileCheck2,
  FileText,
  Network,
  RotateCcw,
  Search,
  Tag,
  Users,
} from 'lucide-react';
import { arxivUrl, doiUrl, inspireUrl, verifiedExternalUrl } from '@/lib/reading/links';
import type {
  PaperEntryType,
  PaperOrigin,
  PaperRole,
  ReadingPaper,
  ReadingRelation,
  ReadingStatus,
} from '@/lib/reading/types';

interface LibraryViewProps {
  papers: ReadingPaper[];
  relations: ReadingRelation[];
  focusPaperId: string | null;
  focusRevision: number;
  onOpenPaper: (paperId: string) => void;
}

interface LibraryFilters {
  topic: string;
  process: string;
  role: string;
  year: string;
  priority: string;
  origin: string;
}

interface SelectOption {
  value: string;
  label: string;
}

const EMPTY_FILTERS: LibraryFilters = {
  topic: '',
  process: '',
  role: '',
  year: '',
  priority: '',
  origin: '',
};

const ROLE_LABELS: Record<PaperRole, string> = {
  foundation: 'Foundation',
  method: 'Method',
  phenomenology: 'Phenomenology',
  experiment: 'Experiment',
  review: 'Review',
  frontier: 'Frontier',
};

const ORIGIN_LABELS: Record<PaperOrigin, string> = {
  thesis_ch1_7: 'Thesis Ch. 1-7',
  bibliography_only: 'Bibliography only',
  external_supplement: 'External supplement',
};

const ENTRY_TYPE_LABELS: Record<PaperEntryType, string> = {
  article: 'Article',
  book: 'Book',
  proceedings: 'Proceedings',
  preprint: 'Preprint',
};

const STATUS_LABELS: Record<ReadingStatus, string> = {
  unknown: 'Unknown (not marked as read)',
  to_read: 'To read',
  skimmed: 'Skimmed',
  read: 'Read',
  deep_read: 'Deep read',
  revisit: 'Revisit',
};

const selectClassName =
  'min-h-10 min-w-0 max-w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-400 dark:bg-neutral-900 dark:text-neutral-600';

const actionClassName =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-amber-700 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 dark:border-neutral-400 dark:bg-neutral-900 dark:text-neutral-600 dark:hover:border-accent dark:hover:text-accent dark:focus-visible:ring-accent dark:focus-visible:ring-offset-neutral-950';

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function sortedStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' })
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-neutral-600 dark:text-neutral-500">
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={selectClassName}>
        <option value="">All {label.toLocaleLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DetailSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h4 className="flex items-center gap-2 text-sm font-semibold text-primary">
        <span className="text-amber-700 dark:text-accent" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h4>
      <div className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-600">{children}</div>
    </section>
  );
}

function relationLabel(relation: ReadingRelation): string {
  return relation.relation.replaceAll('_', ' ');
}

function relationDirection(relation: ReadingRelation, paperId: string): string {
  if (!relation.directed) return 'Undirected proposed connection';
  return relation.source === paperId ? 'Outgoing relation' : 'Incoming relation';
}

function pageList(pages: number[]): string {
  return pages.join(', ');
}

export default function LibraryView({
  papers,
  relations,
  focusPaperId,
  focusRevision,
  onOpenPaper,
}: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<LibraryFilters>({ ...EMPTY_FILTERS });
  const [expandedPaperId, setExpandedPaperId] = useState<string | null>(null);

  const paperById = useMemo(() => new Map(papers.map((paper) => [paper.id, paper])), [papers]);

  const relationsByPaper = useMemo(() => {
    const result = new Map<string, ReadingRelation[]>();
    for (const relation of relations) {
      for (const paperId of new Set([relation.source, relation.target])) {
        const current = result.get(paperId) ?? [];
        current.push(relation);
        result.set(paperId, current);
      }
    }
    return result;
  }, [relations]);

  const filterOptions = useMemo(
    () => ({
      topics: sortedStrings(papers.flatMap((paper) => paper.topics)).map((value) => ({ value, label: value })),
      processes: sortedStrings(papers.flatMap((paper) => paper.processes)).map((value) => ({ value, label: value })),
      roles: sortedStrings(papers.map((paper) => paper.role)).map((value) => ({
        value,
        label: ROLE_LABELS[value as PaperRole],
      })),
      years: Array.from(new Set(papers.map((paper) => paper.year)))
        .sort((left, right) => right - left)
        .map((value) => ({ value: String(value), label: String(value) })),
      priorities: Array.from(new Set(papers.map((paper) => paper.priority)))
        .sort((left, right) => right - left)
        .map((value) => ({ value: String(value), label: `Priority ${value}` })),
      origins: sortedStrings(papers.map((paper) => paper.origin)).map((value) => ({
        value,
        label: ORIGIN_LABELS[value as PaperOrigin],
      })),
    }),
    [papers]
  );

  const filteredPapers = useMemo(() => {
    const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);

    return papers.filter((paper) => {
      const searchable = normalizeSearch(
        [
          paper.id,
          paper.title,
          ...paper.authors,
          paper.collaboration ?? '',
          paper.journal ?? '',
          paper.arxiv ?? '',
          paper.doi ?? '',
          paper.inspire ?? '',
          ...paper.topics,
          ...paper.processes,
          paper.raw_thesis_citation ?? '',
          paper.why_it_matters,
          paper.research_connection,
          paper.personal_notes,
          ...paper.idea_hooks,
          ...paper.source_in_thesis.flatMap((locator) => [locator.section, locator.purpose]),
          paper.verification.content_basis,
          ...paper.verification.sources.flatMap((source) => [source.url, source.locator]),
          ...paper.verification.notes,
        ].join('\n')
      );

      return (
        terms.every((term) => searchable.includes(term)) &&
        (!filters.topic || paper.topics.includes(filters.topic)) &&
        (!filters.process || paper.processes.includes(filters.process)) &&
        (!filters.role || paper.role === filters.role) &&
        (!filters.year || String(paper.year) === filters.year) &&
        (!filters.priority || String(paper.priority) === filters.priority) &&
        (!filters.origin || paper.origin === filters.origin)
      );
    });
  }, [filters, papers, query]);

  const controlsActive = query.trim().length > 0 || Object.values(filters).some(Boolean);

  const resetControls = () => {
    setQuery('');
    setFilters({ ...EMPTY_FILTERS });
  };

  useEffect(() => {
    if (!focusPaperId || !paperById.has(focusPaperId)) return;

    setQuery('');
    setFilters({ ...EMPTY_FILTERS });
    setExpandedPaperId(focusPaperId);

    const animationFrame = window.requestAnimationFrame(() => {
      const paperElement = document.getElementById(`reading-paper-${focusPaperId}`);
      const titleElement = document.getElementById(`reading-paper-title-${focusPaperId}`);
      titleElement?.focus({ preventScroll: true });
      paperElement?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [focusPaperId, focusRevision, paperById]);

  const openRelatedPaper = (paperId: string) => {
    resetControls();
    setExpandedPaperId(paperId);
    onOpenPaper(paperId);
  };

  return (
    <div className="space-y-7">
      <section aria-label="Library search and filters" className="space-y-4 border-b border-neutral-200 pb-6 dark:border-[rgba(148,163,184,0.24)]">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="reading-library-search" className="sr-only">
              Search the Reading library
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
              aria-hidden="true"
            />
            <input
              id="reading-library-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, authors, identifiers, topics, processes, or annotations"
              autoComplete="off"
              className="min-h-10 min-w-0 w-full rounded-md border border-neutral-300 bg-white py-2 pl-10 pr-3 text-sm text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-neutral-400 dark:bg-neutral-900 dark:text-neutral-600"
            />
          </div>
          <button type="button" onClick={resetControls} disabled={!controlsActive} className={actionClassName}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <FilterSelect
            id="reading-filter-topic"
            label="Topics"
            value={filters.topic}
            options={filterOptions.topics}
            onChange={(value) => setFilters((current) => ({ ...current, topic: value }))}
          />
          <FilterSelect
            id="reading-filter-process"
            label="Processes"
            value={filters.process}
            options={filterOptions.processes}
            onChange={(value) => setFilters((current) => ({ ...current, process: value }))}
          />
          <FilterSelect
            id="reading-filter-role"
            label="Roles"
            value={filters.role}
            options={filterOptions.roles}
            onChange={(value) => setFilters((current) => ({ ...current, role: value }))}
          />
          <FilterSelect
            id="reading-filter-year"
            label="Years"
            value={filters.year}
            options={filterOptions.years}
            onChange={(value) => setFilters((current) => ({ ...current, year: value }))}
          />
          <FilterSelect
            id="reading-filter-priority"
            label="Priorities"
            value={filters.priority}
            options={filterOptions.priorities}
            onChange={(value) => setFilters((current) => ({ ...current, priority: value }))}
          />
          <FilterSelect
            id="reading-filter-origin"
            label="Origins"
            value={filters.origin}
            options={filterOptions.origins}
            onChange={(value) => setFilters((current) => ({ ...current, origin: value }))}
          />
        </div>
      </section>

      <section aria-labelledby="reading-library-results">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="reading-library-results" className="text-base font-semibold text-primary">
            Library records
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-500" role="status" aria-live="polite">
            Showing <span className="font-semibold text-neutral-800 dark:text-neutral-600">{filteredPapers.length}</span> of{' '}
            {papers.length}
          </p>
        </div>

        {filteredPapers.length === 0 ? (
          <div className="border-y border-neutral-200 py-12 text-center dark:border-[rgba(148,163,184,0.24)]">
            <Search className="mx-auto h-6 w-6 text-neutral-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-neutral-700 dark:text-neutral-600">No records match these controls.</p>
            <button type="button" onClick={resetControls} className={`${actionClassName} mt-4`}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Clear search and filters
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPapers.map((paper) => {
              const expanded = expandedPaperId === paper.id;
              const detailId = `reading-paper-details-${paper.id}`;
              const externalLinks = [
                { label: 'arXiv', href: arxivUrl(paper.arxiv) },
                { label: 'DOI', href: doiUrl(paper.doi) },
                { label: 'INSPIRE', href: inspireUrl(paper.inspire) },
              ].filter((link): link is { label: string; href: string } => Boolean(link.href));
              const relatedRelations = relationsByPaper.get(paper.id) ?? [];

              return (
                <article
                  id={`reading-paper-${paper.id}`}
                  key={paper.id}
                  className={`scroll-mt-24 rounded-lg border bg-white p-4 shadow-sm transition-colors sm:p-5 dark:bg-neutral-900 ${
                    focusPaperId === paper.id
                      ? 'border-accent'
                      : 'border-neutral-200 hover:border-neutral-300 dark:border-[rgba(148,163,184,0.24)] dark:hover:border-[rgba(148,163,184,0.42)]'
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-500">
                        <span className="rounded border border-neutral-200 px-2 py-0.5 dark:border-[rgba(148,163,184,0.30)]">
                          {ENTRY_TYPE_LABELS[paper.entry_type]}
                        </span>
                        <span className="rounded border border-neutral-200 px-2 py-0.5 dark:border-[rgba(148,163,184,0.30)]">
                          {ROLE_LABELS[paper.role]}
                        </span>
                        <span className="rounded border border-neutral-200 px-2 py-0.5 dark:border-[rgba(148,163,184,0.30)]">
                          Priority {paper.priority}
                          {paper.priority_basis === 'assistant_proposed_curatorial_relevance' ? ' · proposed' : ' · confirmed'}
                        </span>
                        <span className="rounded border border-neutral-200 px-2 py-0.5 dark:border-[rgba(148,163,184,0.30)]">
                          {ORIGIN_LABELS[paper.origin]}
                        </span>
                      </div>

                      <h3
                        id={`reading-paper-title-${paper.id}`}
                        tabIndex={focusPaperId === paper.id ? -1 : undefined}
                        className="mt-3 break-words font-serif text-lg font-semibold leading-snug text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-xl"
                      >
                        {paper.title}
                      </h3>

                      <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">
                        <Users className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
                        <span className="min-w-0 break-words">
                          {paper.authors.join(', ')}
                          {!paper.authors_complete && (
                            <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">(partial author list)</span>
                          )}
                          {paper.collaboration && <span className="block text-neutral-500">{paper.collaboration}</span>}
                        </span>
                      </p>

                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-neutral-600 dark:text-neutral-500">
                        <span className="inline-flex min-w-0 items-center gap-1.5 break-words">
                          <CalendarDays className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                          {paper.journal ? `${paper.journal}, ${paper.year}` : paper.year}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <BookOpen className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                          Reading status: {STATUS_LABELS[paper.reading_status]}
                        </span>
                      </div>

                      {(paper.topics.length > 0 || paper.processes.length > 0) && (
                        <div className="mt-4 space-y-2">
                          {paper.topics.length > 0 && (
                            <div className="flex items-start gap-2">
                              <Tag className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden="true" />
                              <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
                                {paper.topics.map((topic) => (
                                  <li key={topic} className="max-w-full break-words rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-600">
                                    {topic}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {paper.processes.length > 0 && (
                            <div className="flex items-start gap-2">
                              <Network className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden="true" />
                              <ul className="flex flex-wrap gap-1.5" aria-label="Processes">
                                {paper.processes.map((process) => (
                                  <li key={process} className="max-w-full break-words rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 dark:border-[rgba(148,163,184,0.30)] dark:text-neutral-500">
                                    {process}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-48 lg:justify-end">
                      {externalLinks.map((link) => (
                        <a
                          key={link.label}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                          className={actionClassName}
                          aria-label={`Open ${link.label} record for ${paper.title} in a new tab`}
                        >
                          {link.label}
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ))}
                      <button
                        type="button"
                        onClick={() => setExpandedPaperId(expanded ? null : paper.id)}
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        className={actionClassName}
                      >
                        {expanded ? (
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        )}
                        {expanded ? 'Hide details' : 'Show details'}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div id={detailId} className="mt-5 border-t border-neutral-200 pt-5 dark:border-[rgba(148,163,184,0.24)]">
                      <div className="grid gap-6 lg:grid-cols-2">
                        <DetailSection title="Why this record is retained" icon={<BookOpen className="h-4 w-4" />}>
                          <p className="whitespace-pre-wrap break-words">{paper.why_it_matters}</p>
                        </DetailSection>

                        <DetailSection title="Research connection" icon={<Network className="h-4 w-4" />}>
                          <p className="whitespace-pre-wrap break-words">{paper.research_connection}</p>
                        </DetailSection>

                        <DetailSection title="Thesis provenance" icon={<FileText className="h-4 w-4" />}>
                          {paper.bibliography_ref !== null && (
                            <p className="font-medium text-neutral-800 dark:text-neutral-600">
                              Thesis bibliography reference [{paper.bibliography_ref}]
                            </p>
                          )}
                          {paper.raw_thesis_citation && (
                            <p className="mt-2 whitespace-pre-wrap break-words text-neutral-600 dark:text-neutral-500">
                              {paper.raw_thesis_citation}
                            </p>
                          )}
                          {paper.source_in_thesis.length > 0 ? (
                            <ol className="mt-3 space-y-3">
                              {paper.source_in_thesis.map((locator, index) => (
                                <li key={`${locator.chapter}-${locator.section}-${index}`}>
                                  <p className="break-words font-medium text-neutral-800 dark:text-neutral-600">
                                    Chapter {locator.chapter} · {locator.section}
                                  </p>
                                  <p className="text-neutral-600 dark:text-neutral-500">
                                    Printed pages {pageList(locator.printed_pages)} · PDF pages {pageList(locator.pdf_pages)}
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap break-words">{locator.purpose}</p>
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="mt-2 text-neutral-500 dark:text-neutral-500">No in-scope thesis location is assigned.</p>
                          )}
                        </DetailSection>

                        <DetailSection title="Metadata and verification" icon={<FileCheck2 className="h-4 w-4" />}>
                          <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)]">
                            <dt className="font-medium text-neutral-500">Publication year</dt>
                            <dd className="mb-2 min-w-0 break-words sm:mb-0">{paper.year}</dd>
                            <dt className="font-medium text-neutral-500">Preprint year</dt>
                            <dd className="mb-2 min-w-0 break-words sm:mb-0">{paper.preprint_year ?? 'Not recorded'}</dd>
                            <dt className="font-medium text-neutral-500">Journal</dt>
                            <dd className="mb-2 min-w-0 break-words sm:mb-0">{paper.journal ?? 'Not recorded'}</dd>
                            <dt className="font-medium text-neutral-500">Identity status</dt>
                            <dd className="mb-2 min-w-0 break-words sm:mb-0">{paper.verification.identity_status.replaceAll('_', ' ')}</dd>
                            <dt className="font-medium text-neutral-500">Checked on</dt>
                            <dd className="min-w-0 break-words">{paper.verification.checked_on}</dd>
                          </dl>
                          <p className="mt-3 whitespace-pre-wrap break-words">{paper.verification.content_basis}</p>
                          <ul className="mt-3 space-y-2" aria-label="Verification sources">
                            {paper.verification.sources.map((source, index) => {
                              const sourceUrl = verifiedExternalUrl(source.url);
                              return (
                                <li key={`${source.kind}-${source.locator}-${index}`} className="break-words">
                                  {sourceUrl ? (
                                    <a
                                      href={sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      referrerPolicy="no-referrer"
                                      className="inline-flex max-w-full min-w-0 items-start gap-1 break-words font-medium text-amber-700 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 dark:text-accent dark:focus-visible:ring-accent"
                                    >
                                      <span>{source.kind.replaceAll('_', ' ')}: {source.locator}</span>
                                      <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    </a>
                                  ) : (
                                    <span>{source.kind.replaceAll('_', ' ')}: {source.locator}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                          {paper.verification.notes.length > 0 ? (
                            <ul className="mt-3 list-disc space-y-1 pl-5">
                              {paper.verification.notes.map((note, index) => (
                                <li key={index} className="whitespace-pre-wrap break-words">
                                  {note}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-neutral-500 dark:text-neutral-500">No additional metadata or version notes.</p>
                          )}
                        </DetailSection>

                        <DetailSection title="Annotation provenance" icon={<Users className="h-4 w-4" />}>
                          <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)]">
                            <dt className="font-medium text-neutral-500">Annotation author</dt>
                            <dd className="mb-2 min-w-0 break-words sm:mb-0">{paper.annotation_author === 'assistant' ? 'Assistant proposal' : 'User'}</dd>
                            <dt className="font-medium text-neutral-500">Priority basis</dt>
                            <dd className="mb-2 min-w-0 break-words sm:mb-0">{paper.priority_basis.replaceAll('_', ' ')}</dd>
                            <dt className="font-medium text-neutral-500">Curation status</dt>
                            <dd className="mb-2 min-w-0 break-words sm:mb-0">{paper.curation_status}</dd>
                            <dt className="font-medium text-neutral-500">Visibility</dt>
                            <dd className="min-w-0 break-words">{paper.visibility}</dd>
                          </dl>
                          {paper.personal_notes ? (
                            <div className="mt-3">
                              <p className="font-medium text-neutral-800 dark:text-neutral-600">Personal notes</p>
                              <p className="mt-1 whitespace-pre-wrap break-words">{paper.personal_notes}</p>
                            </div>
                          ) : (
                            <p className="mt-3 text-neutral-500 dark:text-neutral-500">No personal notes recorded.</p>
                          )}
                          {paper.idea_hooks.length > 0 ? (
                            <div className="mt-3">
                              <p className="font-medium text-neutral-800 dark:text-neutral-600">Idea hooks</p>
                              <ul className="mt-1 list-disc space-y-1 pl-5">
                                {paper.idea_hooks.map((idea, index) => (
                                  <li key={index} className="whitespace-pre-wrap break-words">
                                    {idea}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <p className="mt-2 text-neutral-500 dark:text-neutral-500">No idea hooks recorded.</p>
                          )}
                        </DetailSection>

                        <DetailSection title="Related papers" icon={<Network className="h-4 w-4" />}>
                          {relatedRelations.length > 0 ? (
                            <ul className="space-y-3">
                              {relatedRelations.map((relation) => {
                                const relatedId = relation.source === paper.id ? relation.target : relation.source;
                                const relatedPaper = paperById.get(relatedId);
                                if (!relatedPaper) return null;

                                return (
                                  <li key={relation.id}>
                                    <button
                                      type="button"
                                      onClick={() => openRelatedPaper(relatedPaper.id)}
                                      className="max-w-full break-words text-left font-medium text-amber-700 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 dark:text-accent dark:focus-visible:ring-accent"
                                    >
                                      {relatedPaper.title}
                                    </button>
                                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-500">
                                      {relationDirection(relation, paper.id)} · {relationLabel(relation)} ·{' '}
                                      {relation.layer.replaceAll('_', ' ')}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-neutral-500 dark:text-neutral-500">No recorded relations for this paper.</p>
                          )}
                        </DetailSection>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
