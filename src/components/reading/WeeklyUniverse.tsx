'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, BookOpen, LoaderCircle, LockKeyhole, Pause, Play, RefreshCw } from 'lucide-react';
import { useLocaleStore } from '@/lib/stores/localeStore';
import { loadWeeklyUniverse, WeeklyLoadError, type WeeklyLoadFailure } from '@/lib/reading/weekly/load';
import { getWeeklyMessages } from '@/lib/reading/weekly/messages';
import type {
  WeeklyLocale,
  WeeklyLocalizedTopic,
  WeeklyTopic,
  WeeklyUniverseBundle,
} from '@/lib/reading/weekly/types';
import styles from './WeeklyUniverse.module.css';

function weeklyLocale(locale: string): WeeklyLocale {
  if (locale === 'zh-hk') return 'zh-hk';
  if (locale === 'zh') return 'zh';
  return 'en';
}

function fullTitle(topic: WeeklyLocalizedTopic, locale: WeeklyLocale): string {
  const parts = [topic.title.before, topic.title.focus, topic.title.after]
    .map((part) => part.trim())
    .filter(Boolean);
  return locale === 'en' ? parts.join(' ') : parts.join('');
}

function focusScale(focus: string, locale: WeeklyLocale): number {
  const length = Array.from(focus.trim()).length;
  if (locale !== 'en') return length >= 5 ? 0.88 : length === 4 ? 0.96 : 1;
  if (length >= 30) return 0.64;
  if (length >= 24) return 0.72;
  if (length >= 18) return 0.82;
  return 1;
}

export default function WeeklyUniverse() {
  const locale = useLocaleStore((state) => state.locale);
  const contentLocale = weeklyLocale(locale);
  const messages = getWeeklyMessages(contentLocale);
  const [bundle, setBundle] = useState<WeeklyUniverseBundle | null>(null);
  const [failure, setFailure] = useState<WeeklyLoadFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [motionPaused, setMotionPaused] = useState(false);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure(null);
    loadWeeklyUniverse(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setBundle(value);
        setSelectedId(value.universe.current_topic_id);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setBundle(null);
        setFailure(error instanceof WeeklyLoadError ? error.kind : 'unavailable');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  const selected = useMemo(
    () => bundle?.universe.topics.find((topic) => topic.id === selectedId) ?? null,
    [bundle, selectedId]
  );

  const selectTopic = (topic: WeeklyTopic) => {
    setSelectedId(topic.id);
    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      detailHeadingRef.current?.focus({ preventScroll: true });
      detailHeadingRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  };

  return (
    <div data-testid="weekly-universe-app" className="mx-auto w-full max-w-[90rem] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="border-b border-neutral-200 pb-6 dark:border-[rgba(148,163,184,0.30)]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-amber-700 dark:text-accent">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              {messages.app.eyebrow}
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-primary sm:text-4xl">{messages.app.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-500 sm:text-base">
              {messages.app.description}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Link href="/reading/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline decoration-neutral-300 underline-offset-4 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {messages.app.back}
            </Link>
            <span className="text-xs text-neutral-500">{messages.app.privateNotice}</span>
          </div>
        </div>
      </header>

      {loading && <WeeklyLoading message={messages.state.loading} />}
      {!loading && failure && (
        <WeeklyFailure
          kind={failure}
          messages={messages}
          onRetry={() => setRevision((value) => value + 1)}
        />
      )}
      {!loading && bundle && selected && (
        <>
          <section className="pt-7" aria-labelledby="weekly-orbit-heading">
            <div className="flex items-center justify-between gap-4">
              <h2 id="weekly-orbit-heading" className="font-serif text-lg font-semibold text-primary">
                {messages.universe.heading}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-neutral-500">{bundle.universe.generated_on}</span>
                <button
                  type="button"
                  data-testid="weekly-motion-toggle"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-neutral-600 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label={motionPaused ? messages.universe.resumeMotion : messages.universe.pauseMotion}
                  aria-pressed={motionPaused}
                  title={motionPaused ? messages.universe.resumeMotion : messages.universe.pauseMotion}
                  onClick={() => setMotionPaused((value) => !value)}
                >
                  {motionPaused
                    ? <Play className="h-4 w-4" aria-hidden="true" />
                    : <Pause className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div
              className={styles.universe}
              data-locale={contentLocale}
              data-paused={motionPaused ? 'true' : 'false'}
              data-testid="weekly-topic-field"
              role="group"
              aria-labelledby="weekly-orbit-heading"
            >
              <svg className={styles.constellations} viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true">
                <path d="M150 125 L500 325 L805 115 L900 365 L755 625 L455 690 L110 430 Z" />
                <path d="M500 325 L755 625 M500 325 L110 430" />
              </svg>
              {bundle.universe.topics.map((topic, index) => {
                const localized = topic.locales[contentLocale];
                const title = fullTitle(localized, contentLocale);
                const active = selected.id === topic.id;
                const topicStyle = {
                  '--weekly-focus-scale': focusScale(localized.title.focus, contentLocale),
                } as CSSProperties;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    className={styles.topic}
                    data-orbit={index % 7}
                    data-phase={topic.phase}
                    data-testid={`weekly-topic-${topic.id}`}
                    style={topicStyle}
                    aria-label={messages.universe.openTopic(title)}
                    aria-pressed={active}
                    aria-controls="weekly-topic-detail"
                    onClick={() => selectTopic(topic)}
                  >
                    <span className={styles.phase}>{messages.universe.phase[topic.phase]}</span>
                    <span className={styles.titleParts} aria-hidden="true">
                      <span className={styles.titleBefore}>{localized.title.before || '\u00a0'}</span>
                      <span className={styles.titleFocus}>{localized.title.focus}</span>
                      <span className={styles.titleAfter}>{localized.title.after || '\u00a0'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <TopicDetail
            headingRef={detailHeadingRef}
            topic={selected}
            content={selected.locales[contentLocale]}
            locale={contentLocale}
            bundle={bundle}
            messages={messages}
          />
        </>
      )}
    </div>
  );
}

const TopicDetail = function TopicDetail({
  headingRef,
  topic,
  content,
  locale,
  bundle,
  messages,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  topic: WeeklyTopic;
  content: WeeklyLocalizedTopic;
  locale: WeeklyLocale;
  bundle: WeeklyUniverseBundle;
  messages: ReturnType<typeof getWeeklyMessages>;
}) {
  const title = fullTitle(content, locale);
  return (
    <section id="weekly-topic-detail" className="border-t border-neutral-200 py-10 dark:border-[rgba(148,163,184,0.30)]" aria-labelledby="weekly-selected-title">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <p className="text-xs font-semibold uppercase text-amber-700 dark:text-accent">{content.eyebrow}</p>
          <h2 ref={headingRef} tabIndex={-1} id="weekly-selected-title" className="scroll-mt-24 mt-3 max-w-3xl font-serif text-2xl font-semibold leading-tight text-primary focus-visible:outline-none focus-visible:underline focus-visible:decoration-accent focus-visible:decoration-2 focus-visible:underline-offset-4 sm:text-3xl" aria-live="polite">
            {title}
          </h2>
          <p className="mt-4 text-xs leading-relaxed text-neutral-500">{messages.detail.proposalNotice}</p>

          <dl className="mt-8 space-y-7">
            <div>
              <dt className="text-xs font-semibold uppercase text-neutral-500">{messages.detail.question}</dt>
              <dd className="mt-2 text-lg leading-relaxed text-primary">{content.question}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-neutral-500">{messages.detail.whyNow}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">{content.why_now}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-neutral-500">{messages.detail.scope}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">{content.scope}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h3 className="font-serif text-lg font-semibold text-primary">{messages.detail.weeklyRoute}</h3>
          <ol className="mt-5 border-l border-neutral-300 dark:border-neutral-600">
            {content.plan.map((step, index) => (
              <li key={`${step.label}-${index}`} className="relative pb-6 pl-7 last:pb-0">
                <span className="absolute -left-3 top-0 flex h-6 w-6 items-center justify-center bg-background text-xs font-semibold tabular-nums text-accent" aria-hidden="true">
                  {index + 1}
                </span>
                <h4 className="text-sm font-semibold text-primary">{step.label}</h4>
                <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-9 border-t border-neutral-200 pt-6 dark:border-[rgba(148,163,184,0.30)]">
            <h3 className="flex items-center gap-2 font-serif text-lg font-semibold text-primary">
              <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
              {messages.detail.references}
            </h3>
            <ul className="mt-4 space-y-3">
              {topic.reference_ids.map((id) => {
                const paper = bundle.papers[id];
                return (
                  <li key={id}>
                    <a
                      href={`/reading/#paper-${encodeURIComponent(id)}`}
                      className="text-sm leading-relaxed text-primary underline decoration-neutral-300 underline-offset-4 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-label={messages.detail.openReference(paper.title, paper.year)}
                    >
                      {paper.title} <span className="text-neutral-500">({paper.year})</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-10 grid border-y border-neutral-200 dark:border-[rgba(148,163,184,0.30)] sm:grid-cols-2">
        <div className="py-6 sm:pr-8">
          <h3 className="text-xs font-semibold uppercase text-neutral-500">{messages.detail.deliverable}</h3>
          <p className="mt-2 text-sm leading-relaxed text-primary">{content.deliverable}</p>
        </div>
        <div className="border-t border-neutral-200 py-6 dark:border-[rgba(148,163,184,0.30)] sm:border-l sm:border-t-0 sm:pl-8">
          <h3 className="text-xs font-semibold uppercase text-neutral-500">{messages.detail.guardrail}</h3>
          <p className="mt-2 text-sm leading-relaxed text-primary">{content.guardrail}</p>
        </div>
      </div>
    </section>
  );
};

function WeeklyLoading({ message }: { message: string }) {
  return (
    <div className="flex min-h-[32rem] items-center justify-center" role="status">
      <div className="text-center">
        <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-primary">{message}</p>
      </div>
    </div>
  );
}

function WeeklyFailure({
  kind,
  messages,
  onRetry,
}: {
  kind: WeeklyLoadFailure;
  messages: ReturnType<typeof getWeeklyMessages>;
  onRetry: () => void;
}) {
  const title = kind === 'authentication'
    ? messages.state.authTitle
    : kind === 'malformed'
      ? messages.state.malformedTitle
      : messages.state.unavailableTitle;
  const body = kind === 'authentication'
    ? messages.state.authMessage
    : kind === 'malformed'
      ? messages.state.malformedMessage
      : messages.state.unavailableMessage;
  return (
    <div className="flex min-h-[32rem] items-center justify-center px-6 text-center" role="alert">
      <div className="max-w-lg">
        <AlertTriangle className="mx-auto h-7 w-7 text-accent" aria-hidden="true" />
        <h2 className="mt-4 font-serif text-xl font-semibold text-primary">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">{body}</p>
        <button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-background outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-neutral-900">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {messages.state.retry}
        </button>
      </div>
    </div>
  );
}
