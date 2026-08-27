'use client';

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import type MiniSearch from 'minisearch';
import { FileText, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useMessages } from '@/lib/i18n/useMessages';
import { useLocaleStore } from '@/lib/stores/localeStore';
import type { SearchDocument, SearchIndex } from '@/types/search';

type SearchResult = SearchDocument & { score: number };

function tokenizeForSearch(text: string): string[] {
  const chunks = text.toLocaleLowerCase().match(/[\p{Script=Han}]+|[\p{L}\p{N}_]+/gu) || [];

  return chunks.flatMap((chunk) => {
    if (!/^[\p{Script=Han}]+$/u.test(chunk)) {
      return [chunk];
    }

    const characters = Array.from(chunk);
    if (characters.length < 2) {
      return characters;
    }

    return characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1]}`);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getExcerpt(body: string, query: string): string {
  const normalizedBody = body.toLocaleLowerCase();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const terms = tokenizeForSearch(query).filter((term) => term.length > 1);
  const positions = [normalizedBody.indexOf(normalizedQuery), ...terms.map((term) => normalizedBody.indexOf(term))]
    .filter((position) => position >= 0);
  const matchPosition = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, matchPosition - 72);
  const end = Math.min(body.length, Math.max(matchPosition + Math.max(query.length, 24) + 96, 180));
  const prefix = start > 0 ? '...' : '';
  const suffix = end < body.length ? '...' : '';
  return `${prefix}${body.slice(start, end).trim()}${suffix}`;
}

function countOccurrences(text: string, phrase: string): number {
  if (!phrase) return 0;
  return text.split(phrase).length - 1;
}

function HighlightedExcerpt({ text, query }: { text: string; query: string }) {
  const terms = [query.trim(), ...tokenizeForSearch(query)]
    .filter((term) => term.length > 1)
    .sort((left, right) => right.length - left.length);
  const uniqueTerms = Array.from(new Set(terms));

  if (uniqueTerms.length === 0) {
    return <>{text}</>;
  }

  const pattern = uniqueTerms.map(escapeRegExp).join('|');
  const expression = new RegExp(`(${pattern})`, 'giu');
  const matchExpression = new RegExp(`^(?:${pattern})$`, 'iu');
  return (
    <>
      {text.split(expression).map((part, index) => (
        matchExpression.test(part) ? (
          <mark key={`${part}-${index}`} className="bg-accent/20 px-0.5 text-inherit">
            {part}
          </mark>
        ) : part
      ))}
    </>
  );
}

function getLanguageLabel(locale: string, labels: {
  languageEnglish: string;
  languageSimplified: string;
  languageTraditional: string;
}) {
  if (locale === 'zh') return labels.languageSimplified;
  if (locale === 'zh-hk') return labels.languageTraditional;
  return labels.languageEnglish;
}

export default function SiteSearch() {
  const messages = useMessages();
  const locale = useLocaleStore((state) => state.locale);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const miniSearchRef = useRef<MiniSearch<SearchDocument> | null>(null);
  const loadingRef = useRef<Promise<void> | null>(null);

  const loadIndex = useCallback(async () => {
    if (miniSearchRef.current || loadingRef.current) {
      await loadingRef.current;
      return;
    }

    setStatus('loading');
    loadingRef.current = (async () => {
      const [response, miniSearchModule] = await Promise.all([
        fetch('/search-index.json'),
        import('minisearch'),
      ]);
      if (!response.ok) {
        throw new Error(`Search index request failed with ${response.status}.`);
      }

      const searchIndex = await response.json() as SearchIndex;
      const MiniSearchConstructor = miniSearchModule.default;
      const miniSearch = new MiniSearchConstructor<SearchDocument>({
        fields: ['title', 'section', 'body'],
        idField: 'id',
        storeFields: ['id'],
        tokenize: tokenizeForSearch,
        processTerm: (term) => term.toLocaleLowerCase(),
      });
      miniSearch.addAll(searchIndex.documents);
      miniSearchRef.current = miniSearch;
      setIndex(searchIndex);
      setStatus('ready');
    })();

    try {
      await loadingRef.current;
    } catch (error) {
      console.error('Could not load site search.', error);
      loadingRef.current = null;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadIndex();
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, loadIndex]);

  const results = useMemo<SearchResult[]>(() => {
    if (!index || !miniSearchRef.current || !query.trim()) {
      return [];
    }

    const documentsById = new Map(index.documents.map((document) => [document.id, document]));
    const rawResults = miniSearchRef.current.search(query, {
      combineWith: 'AND',
      boost: { title: 8, section: 5, body: 1 },
    });
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matched = rawResults.flatMap((result) => {
      const document = documentsById.get(result.id);
      if (!document) return [];
      const title = document.title.toLocaleLowerCase();
      const section = document.section.toLocaleLowerCase();
      const body = document.body.toLocaleLowerCase();
      const exactBoost = countOccurrences(title, normalizedQuery) * 160
        + countOccurrences(section, normalizedQuery) * 110
        + countOccurrences(body, normalizedQuery) * 48;
      return [{ ...document, score: result.score + exactBoost }];
    });

    const currentLocaleResults = matched.filter((result) => result.locale === locale);
    const universalResults = matched.filter((result) => result.locale === 'universal');
    const candidates = currentLocaleResults.length > 0
      ? [...currentLocaleResults, ...universalResults]
      : matched;
    const seenCanonicalIds = new Set<string>();

    return candidates
      .sort((left, right) => right.score - left.score)
      .filter((result) => {
        if (seenCanonicalIds.has(result.canonicalId)) return false;
        seenCanonicalIds.add(result.canonicalId);
        return true;
      })
      .slice(0, 20);
  }, [index, locale, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, locale]);

  const openResult = useCallback((result: SearchResult, resultIndex: number) => {
    setIsOpen(false);
    const resultLink = document.getElementById(`site-search-result-${resultIndex}`);
    if (resultLink instanceof HTMLAnchorElement) {
      resultLink.click();
      return;
    }
    if (result.kind === 'pdf') {
      window.open(result.href, '_blank', 'noopener,noreferrer');
      return;
    }
    window.location.assign(result.href);
  }, []);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % results.length);
    }
    if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + results.length) % results.length);
    }
    if (event.key === 'Enter' && results[selectedIndex]) {
      event.preventDefault();
      openResult(results[selectedIndex], selectedIndex);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-background',
          'text-neutral-600 transition-all duration-200 hover:bg-neutral-50 hover:text-primary',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          'dark:border-[rgba(148,163,184,0.24)] dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-white'
        )}
        title={messages.search.open}
        aria-label={messages.search.open}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>

      <Dialog open={isOpen} onClose={setIsOpen} initialFocus={inputRef} className="relative z-[70]">
        <div className="fixed inset-0 bg-black/45 backdrop-blur-[1px]" aria-hidden="true" />
        <div className="fixed inset-0 overflow-y-auto p-3 sm:p-8">
          <div className="flex min-h-full items-start justify-center pt-[10vh] sm:pt-[14vh]">
            <DialogPanel className="w-full max-w-3xl overflow-hidden rounded-md border border-neutral-200 bg-background shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
              <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:px-5">
                <Search className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <DialogTitle className="sr-only">{messages.search.title}</DialogTitle>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={messages.search.placeholder}
                  aria-label={messages.search.placeholder}
                  aria-controls="site-search-results"
                  aria-activedescendant={results[selectedIndex] ? `site-search-result-${selectedIndex}` : undefined}
                  className="min-w-0 flex-1 bg-transparent text-base text-primary outline-none placeholder:text-neutral-400"
                />
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 dark:hover:bg-neutral-800 dark:hover:text-white"
                  title={messages.search.close}
                  aria-label={messages.search.close}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div id="site-search-results" role="listbox" className="max-h-[min(62vh,36rem)] overflow-y-auto p-3 sm:p-4">
                {status === 'loading' && (
                  <p className="px-2 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">{messages.search.loading}</p>
                )}
                {status === 'error' && (
                  <p className="px-2 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">{messages.search.unavailable}</p>
                )}
                {status === 'ready' && !query.trim() && (
                  <p className="px-2 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">{messages.search.start}</p>
                )}
                {status === 'ready' && query.trim() && results.length === 0 && (
                  <p className="px-2 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">{messages.search.noResults}</p>
                )}
                {status === 'ready' && results.length > 0 && (
                  <div className="space-y-2">
                    {results.map((result, resultIndex) => {
                      const fallbackLanguage = result.locale !== 'universal' && result.locale !== locale;
                      const source = result.kind === 'pdf' ? messages.search.pdf : result.source || messages.search.page;
                      const metadata = [
                        source,
                        result.section,
                        result.page ? `${messages.search.pageNumber} ${result.page}` : '',
                        result.version ? `${messages.search.version} ${result.version}` : '',
                      ].filter(Boolean);
                      const excerpt = getExcerpt(result.body, query);

                      return (
                        <a
                          key={result.id}
                          id={`site-search-result-${resultIndex}`}
                          href={result.href}
                          target={result.kind === 'pdf' ? '_blank' : undefined}
                          rel={result.kind === 'pdf' ? 'noopener noreferrer' : undefined}
                          role="option"
                          aria-selected={resultIndex === selectedIndex}
                          onMouseEnter={() => setSelectedIndex(resultIndex)}
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            'block w-full rounded-md border p-3 text-left transition-colors sm:p-4',
                            resultIndex === selectedIndex
                              ? 'border-accent/50 bg-accent/5'
                              : 'border-neutral-200 bg-white hover:border-accent/35 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <h3 className="text-sm font-semibold leading-snug text-primary sm:text-base">{result.title}</h3>
                                {fallbackLanguage && (
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {messages.search.language}: {getLanguageLabel(result.locale, messages.search)}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                                {metadata.join(' · ')}
                              </p>
                              <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                                <HighlightedExcerpt text={excerpt} query={query} />
                              </p>
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </>
  );
}
