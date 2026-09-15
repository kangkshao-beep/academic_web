'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, BookOpen, LoaderCircle, Network, RefreshCw, Route } from 'lucide-react';
import { loadReadingBundle, ReadingLoadError, type ReadingLoadFailure } from '@/lib/reading/load';
import type { ReadingBundle, ReadingTab } from '@/lib/reading/types';
import LibraryView from './LibraryView';
import ThreadsView from './ThreadsView';

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[32rem] items-center justify-center border border-neutral-200 bg-neutral-50 text-sm text-neutral-500 dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900 sm:h-[38rem]">
      <LoaderCircle className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      正在加载本地图谱组件…
    </div>
  ),
});

const TABS: Array<{ id: ReadingTab; label: string; icon: typeof BookOpen }> = [
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'map', label: 'Map', icon: Network },
  { id: 'threads', label: 'Threads', icon: Route },
];

interface FailureState {
  kind: ReadingLoadFailure;
  message: string;
}

export default function ReadingApp() {
  const [bundle, setBundle] = useState<ReadingBundle | null>(null);
  const [failure, setFailure] = useState<FailureState | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestRevision, setRequestRevision] = useState(0);
  const [activeTab, setActiveTab] = useState<ReadingTab>('library');
  const [focusPaperId, setFocusPaperId] = useState<string | null>(null);
  const [focusRevision, setFocusRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure(null);

    loadReadingBundle(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setBundle(data);
        setActiveTab(data.viewConfig.default_view);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setBundle(null);
        if (error instanceof ReadingLoadError) {
          setFailure({ kind: error.kind, message: error.message });
        } else {
          setFailure({ kind: 'unavailable', message: 'Reading 数据加载失败。' });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [requestRevision]);

  const openPaper = useCallback((paperId: string) => {
    setFocusPaperId(paperId);
    setFocusRevision((revision) => revision + 1);
    setActiveTab('library');
  }, []);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (!bundle) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = TABS[nextIndex].id;
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`reading-tab-${nextTab}`)?.focus());
  };

  return (
    <div className="mx-auto min-w-0 w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="border-b border-neutral-200 pb-6 dark:border-[rgba(148,163,184,0.30)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-amber-700 dark:text-accent">Open · Read only</p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-primary sm:text-4xl">Reading</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-500 sm:text-base">
              Inclusive heavy-flavor semileptonic decays 的研究阅读索引、关系图谱与主题线索。
            </p>
          </div>
          {bundle && (
            <p className="shrink-0 text-sm tabular-nums text-neutral-500" aria-live="polite">
              {bundle.library.papers.length} 篇 · {bundle.relations.edges.length} 条关系 · {bundle.threads.threads.length} 条线索
            </p>
          )}
        </div>
      </header>

      <nav className="mt-6 border-b border-neutral-200 dark:border-[rgba(148,163,184,0.30)]" aria-label="Reading 视图">
        <div className="flex min-w-0 gap-1 overflow-x-auto" role="tablist" aria-orientation="horizontal">
          {TABS.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              id={`reading-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`reading-panel-${id}`}
              tabIndex={activeTab === id ? 0 : -1}
              disabled={!bundle}
              onClick={() => setActiveTab(id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-45 ${
                activeTab === id
                  ? 'border-accent text-primary'
                  : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-primary'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="mt-6 min-h-[28rem]">
        {loading && <LoadingState />}
        {!loading && failure && (
          <ErrorState
            failure={failure}
            onRetry={() => setRequestRevision((revision) => revision + 1)}
          />
        )}
        {!loading && bundle && (
          <>
            <section
              id="reading-panel-library"
              role="tabpanel"
              aria-labelledby="reading-tab-library"
              tabIndex={0}
              hidden={activeTab !== 'library'}
            >
              {activeTab === 'library' && (
                <LibraryView
                  papers={bundle.library.papers}
                  relations={bundle.relations.edges}
                  focusPaperId={focusPaperId}
                  focusRevision={focusRevision}
                  onOpenPaper={openPaper}
                />
              )}
            </section>

            <section
              id="reading-panel-map"
              role="tabpanel"
              aria-labelledby="reading-tab-map"
              tabIndex={0}
              hidden={activeTab !== 'map'}
            >
              {activeTab === 'map' && (
                <MapView
                  papers={bundle.library.papers}
                  relations={bundle.relations.edges}
                  config={bundle.viewConfig.graph}
                  onOpenPaper={openPaper}
                />
              )}
            </section>

            <section
              id="reading-panel-threads"
              role="tabpanel"
              aria-labelledby="reading-tab-threads"
              tabIndex={0}
              hidden={activeTab !== 'threads'}
            >
              {activeTab === 'threads' && (
                <ThreadsView
                  threads={bundle.threads.threads}
                  papers={bundle.library.papers}
                  onOpenPaper={openPaper}
                />
              )}
            </section>
          </>
        )}
      </div>

      <aside aria-label="Reading data notice" className="mt-10 border-t border-neutral-200 pt-5 text-xs leading-relaxed text-neutral-500 dark:border-[rgba(148,163,184,0.30)]">
        优先级、说明与阅读顺序均保留其数据中标明的提议来源；阅读状态未知不代表已读。浏览器不保存编辑、笔记或筛选状态。
      </aside>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[28rem] items-center justify-center border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" role="status">
      <div>
        <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-primary">正在读取 Reading 数据…</p>
      </div>
    </div>
  );
}

function ErrorState({ failure, onRetry }: { failure: FailureState; onRetry: () => void }) {
  const malformed = failure.kind === 'malformed';
  const title = malformed ? '数据格式不符合 Reading v1 契约' : 'Reading 数据暂不可用';

  return (
    <div className="flex min-h-[28rem] items-center justify-center border border-neutral-200 bg-neutral-50 p-8 text-center dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900" role="alert">
      <div className="max-w-lg">
        <AlertTriangle className="mx-auto h-7 w-7 text-accent" aria-hidden="true" />
        <h2 className="mt-4 font-serif text-xl font-semibold text-primary">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">{failure.message}</p>
        <button type="button" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-background outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-neutral-900">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          重试
        </button>
      </div>
    </div>
  );
}
