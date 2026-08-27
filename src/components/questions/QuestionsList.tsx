'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { QuestionItem, QuestionsQuote } from '@/types/page';
import { useMessages } from '@/lib/i18n/useMessages';
import { useLocaleStore } from '@/lib/stores/localeStore';
import { cn } from '@/lib/utils';

interface QuestionsListProps {
  title?: string;
  description?: string;
  quote?: QuestionsQuote;
  questions: QuestionItem[];
  embedded?: boolean;
}

export default function QuestionsList({
  title,
  description,
  quote,
  questions,
  embedded = false,
}: QuestionsListProps) {
  const messages = useMessages();
  const locale = useLocaleStore((state) => state.locale);
  const resolvedTitle = title || messages.home.openQuestions;
  const [selectedTag, setSelectedTag] = useState<string>('all');

  const formatAnswerDate = (date?: string) => {
    if (!date) {
      return null;
    }

    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (locale.startsWith('zh') && match) {
      return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
    }

    return date;
  };

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

      {quote && !embedded && (
        <figure className="mb-8 border-l-4 border-accent pl-5">
          <blockquote className="text-lg font-serif leading-relaxed text-primary">
            {quote.text}
          </blockquote>
          {quote.german && (
            <p className="mt-3 text-sm italic leading-relaxed text-neutral-600 dark:text-neutral-400">
              {quote.german}
            </p>
          )}
          {quote.source && (
            <figcaption className="mt-3 text-xs uppercase tracking-[0.14em] text-neutral-500">
              {quote.source}
            </figcaption>
          )}
        </figure>
      )}

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
              {item.context && (
                <p className="mb-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">
                  {item.context}
                </p>
              )}
              {item.answer && (
                <div className="mb-4 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                    {messages.questions.answer}
                    {formatAnswerDate(item.answerDate || item.date) && (
                      <span className="ml-2 normal-case tracking-normal text-accent/80">
                        · {formatAnswerDate(item.answerDate || item.date)}
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {item.answer}
                  </p>
                </div>
              )}
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
