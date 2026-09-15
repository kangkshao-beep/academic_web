'use client';

import { BookOpen, CircleHelp, GitBranch, LibraryBig, ScrollText } from 'lucide-react';
import type { ReadingMessages } from '@/lib/reading/messages';
import type { ReadingPaper, ReadingThread } from '@/lib/reading/types';

interface ThreadsViewProps {
  threads: ReadingThread[];
  papers: ReadingPaper[];
  onOpenPaper: (paperId: string) => void;
  messages: ReadingMessages;
}

/**
 * The thread list is intentionally rendered in the order supplied by the
 * Reading dataset. That order is a curation aid, not a claim about citation
 * history or influence.
 */
export default function ThreadsView({ threads, papers, onOpenPaper, messages }: ThreadsViewProps) {
  const papersById = new Map(papers.map((paper) => [paper.id, paper]));

  return (
    <section aria-labelledby="reading-threads-heading" className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-start gap-3">
          <GitBranch className="mt-1 h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <h2 id="reading-threads-heading" className="text-2xl font-serif font-bold text-primary sm:text-3xl">
              {messages.threads.heading}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">
              {messages.threads.description}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 border-l-2 border-accent/60 pl-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-500">
          <LibraryBig className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <p>{messages.threads.libraryNotice}</p>
        </div>
      </header>

      {threads.length === 0 ? (
        <div className="border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-[rgba(148,163,184,0.30)] dark:text-neutral-500">
          {messages.threads.empty}
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {threads.map((thread, threadIndex) => (
            <article
              key={thread.id}
              data-thread-id={thread.id}
              className="flex h-full flex-col rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-[rgba(148,163,184,0.30)] dark:bg-neutral-900 sm:p-6"
            >
              <header className="border-b border-neutral-200 pb-4 dark:border-[rgba(148,163,184,0.30)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent/10 text-sm font-semibold tabular-nums text-accent"
                      aria-label={messages.threads.threadNumber(threadIndex + 1)}
                    >
                      {threadIndex + 1}
                    </span>
                    <h3 className="min-w-0 text-lg font-semibold leading-snug text-primary sm:text-xl">
                      {thread.title}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded border border-accent/30 px-2 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-accent">
                    {thread.status === 'accepted' ? messages.labels.accepted : messages.labels.proposed}
                  </span>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-600">
                  {thread.summary}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500 dark:text-neutral-500">
                  <span className="inline-flex items-center gap-1.5">
                    <ScrollText className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    <span className="font-medium">{messages.threads.thesisChapters}</span>
                    {thread.thesis_chapters.length > 0
                      ? thread.thesis_chapters.map(messages.threads.chapter).join(', ')
                      : messages.threads.noneListed}
                  </span>
                  <span>{messages.threads.annotation} {messages.labels.annotationAuthors[thread.annotation_author]}</span>
                </div>
              </header>

              <div className="flex-1">
                <h4 className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-500">
                  {messages.threads.orderedStages}
                </h4>
                <ol className="mt-3 space-y-4" aria-label={messages.threads.orderedStagesLabel(thread.title)}>
                  {thread.stages.map((stage, stageIndex) => (
                    <li key={`${thread.id}-${stage.label}-${stageIndex}`} className="border-l-2 border-neutral-200 pl-4 dark:border-[rgba(148,163,184,0.30)]">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold tabular-nums text-accent">{stageIndex + 1}.</span>
                        <h5 className="text-sm font-semibold text-primary">{stage.label}</h5>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">
                        {stage.narrative}
                      </p>

                      {stage.papers.length > 0 ? (
                        <ul className="mt-3 space-y-2" aria-label={messages.threads.linkedPapersLabel(stage.label)}>
                          {stage.papers.map((paperId) => {
                            const paper = papersById.get(paperId);

                            if (!paper) {
                              return (
                                <li key={paperId} className="text-xs text-neutral-500 dark:text-neutral-500">
                                  <span className="font-medium">{messages.threads.linkedPaperUnavailable}</span>
                                  <span className="sr-only">: {paperId}</span>
                                </li>
                              );
                            }

                            return (
                              <li key={paper.id}>
                                <button
                                  type="button"
                                  onClick={() => onOpenPaper(paper.id)}
                                  className="group flex w-full items-start gap-2 rounded border border-neutral-200 px-3 py-2 text-left transition-colors hover:border-accent/50 hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 dark:border-[rgba(148,163,184,0.30)] dark:hover:border-accent/50 dark:hover:bg-accent/10"
                                  aria-label={messages.threads.openPaper(paper.title, paper.year)}
                                >
                                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium leading-snug text-primary group-hover:text-accent">
                                      {paper.title}
                                    </span>
                                    <span className="mt-1 block text-xs capitalize text-neutral-500 dark:text-neutral-500">
                                      {paper.year} · {messages.labels.roles[paper.role]}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="mt-3 inline-flex items-start gap-2 text-xs italic leading-relaxed text-neutral-500 dark:text-neutral-500">
                          <ScrollText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden="true" />
                          {messages.threads.noLinkedLiterature}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>

              <aside className="mt-6 border-t border-accent/25 pt-4" aria-label={messages.threads.readingPromptLabel(thread.title)}>
                <div className="flex items-start gap-2">
                  <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{messages.threads.readingPrompt}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-600">{thread.reading_question}</p>
                    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
                      {messages.threads.promptDisclaimer}
                    </p>
                  </div>
                </div>
              </aside>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
