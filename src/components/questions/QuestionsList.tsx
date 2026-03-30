'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { QuestionItem } from '@/types/page';
import { useMessages } from '@/lib/i18n/useMessages';
import { cn } from '@/lib/utils';

interface QuestionsListProps {
  title?: string;
  description?: string;
  questions: QuestionItem[];
  embedded?: boolean;
}

export default function QuestionsList({
  title,
  description,
  questions,
  embedded = false,
}: QuestionsListProps) {
  const messages = useMessages();
  const resolvedTitle = title || messages.home.openQuestions;
  const [selectedTag, setSelectedTag] = useState<string>('all');

  const tags = useMemo(() => {
    return Array.from(new Set(questions.flatMap((item) => item.tags))).sort();
  }, [questions]);

  const visibleQuestions = useMemo(() => {
    if (embedded || selectedTag === 'all') {
      return questions;
    }

    return questions.filter((item) => item.tags.includes(selectedTag));
  }, [embedded, questions, selectedTag]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.45 }}
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className={`${embedded ? 'text-2xl' : 'text-4xl'} font-serif font-bold text-primary`}>
            {resolvedTitle}
          </h2>
          {description && !embedded && (
            <p className="mt-3 max-w-2xl text-neutral-600 dark:text-neutral-500">
              {description}
            </p>
          )}
        </div>
        {embedded && (
          <Link
            href="/questions"
            prefetch={true}
            className="shrink-0 text-accent hover:text-accent-dark text-sm font-medium transition-all duration-200 rounded hover:bg-accent/10 hover:shadow-sm"
          >
            {messages.home.viewAll} →
          </Link>
        )}
      </div>

      {!embedded && tags.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-500">{messages.questions.filterByTag}:</span>
          <button
            onClick={() => setSelectedTag('all')}
            className={cn(
              'px-3 py-1 text-xs rounded-full transition-colors',
              selectedTag === 'all'
                ? 'bg-accent text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-accent hover:text-white'
            )}
          >
            {messages.common.all}
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={cn(
                'px-3 py-1 text-xs rounded-full transition-colors',
                selectedTag === tag
                  ? 'bg-accent text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-accent hover:text-white'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {visibleQuestions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            {messages.questions.noResults}
          </div>
        ) : (
          visibleQuestions.map((item, index) => (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.06 * index }}
              className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.14em] text-neutral-500">
                <span>{item.date}</span>
              </div>
              <h3 className="mb-2 text-lg font-semibold leading-tight text-primary">
                {item.question}
              </h3>
              <p className="mb-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">
                {item.context}
              </p>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span
                    key={`${item.id}-${tag}`}
                    className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </motion.article>
          ))
        )}
      </div>
    </motion.section>
  );
}
