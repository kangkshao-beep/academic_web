'use client';

import { motion } from 'framer-motion';
import { ExternalLink, FileText, History } from 'lucide-react';
import type { LearningPageConfig, LearningUpdate } from '@/types/page';

function sortUpdates(updates: LearningUpdate[] = []): LearningUpdate[] {
  return [...updates].sort((left, right) => right.date.localeCompare(left.date));
}

export default function LearningPage({
  config,
  embedded = false,
}: {
  config: LearningPageConfig;
  embedded?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className={embedded ? 'mb-5' : 'mb-8'}>
        <h1 className={`${embedded ? 'text-2xl' : 'text-4xl'} font-serif font-bold text-primary`}>
          {config.title}
        </h1>
        {config.description && (
          <p className={`${embedded ? 'mt-2 text-base' : 'mt-4 text-lg'} max-w-3xl leading-relaxed text-neutral-600 dark:text-neutral-400`}>
            {config.description}
          </p>
        )}
      </div>

      <div className={embedded ? 'space-y-4' : 'space-y-6'}>
        {config.courses.map((course, index) => {
          const updates = sortUpdates(course.updates);
          const version = course.version || config.version_pending;

          return (
            <motion.article
              key={course.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
              className="border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-serif text-xl font-semibold text-primary sm:text-2xl">
                    <span className="font-mono text-sm font-medium text-accent">{version}</span>
                    <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-700">&middot;</span>
                    <span>{course.title}</span>
                  </h2>
                </div>

                {course.pdf ? (
                  <a
                    href={course.pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center justify-center gap-2 border border-accent bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    <span>{config.pdf_label}</span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-2 self-start border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    {config.pdf_pending}
                  </span>
                )}
              </div>

              <section className="mt-6 border-t border-neutral-200 pt-5 dark:border-neutral-800" aria-labelledby={`${course.id}-updates`}>
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <History className="h-4 w-4 text-accent" aria-hidden="true" />
                  <h3 id={`${course.id}-updates`}>{config.updates_title}</h3>
                </div>

                {updates.length > 0 ? (
                  <ol className="mt-4 space-y-5 border-l border-neutral-200 pl-5 dark:border-neutral-700">
                    {updates.map((update) => (
                      <li key={`${update.date}-${update.content}`} className="relative">
                        <span className="absolute -left-[1.68rem] top-1.5 h-2.5 w-2.5 border-2 border-white bg-accent dark:border-neutral-900" aria-hidden="true" />
                        <time className="block text-xs font-medium text-neutral-500" dateTime={update.date}>
                          {update.date}
                        </time>
                        <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{update.content}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{config.empty_updates}</p>
                )}
              </section>
            </motion.article>
          );
        })}
      </div>
    </motion.div>
  );
}
