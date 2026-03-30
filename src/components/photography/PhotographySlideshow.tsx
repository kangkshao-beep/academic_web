'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { GalleryPageConfig } from '@/types/page';
import { useMessages } from '@/lib/i18n/useMessages';
import { cn } from '@/lib/utils';

interface PhotographySlideshowProps {
  config: GalleryPageConfig;
  embedded?: boolean;
}

export default function PhotographySlideshow({
  config,
  embedded = false,
}: PhotographySlideshowProps) {
  const messages = useMessages();
  const items = useMemo(() => config.items || [], [config.items]);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const activeItem = items[activeIndex];
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < items.length - 1;

  const goPrev = useCallback(() => {
    setActiveIndex((current) => Math.max(current - 1, 0));
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((current) => Math.min(current + 1, items.length - 1));
  }, [items.length]);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (!items.length) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        goPrev();
      }
      if (event.key === 'ArrowRight') {
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, items.length]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) {
      return;
    }

    const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = touchStartX.current - touchEndX;
    touchStartX.current = null;

    if (Math.abs(delta) < 40) {
      return;
    }

    if (delta > 0) {
      goNext();
    } else {
      goPrev();
    }
  };

  if (!items.length || !activeItem) {
    return (
      <section>
        <h1 className={`${embedded ? 'text-2xl' : 'text-4xl'} font-serif font-bold text-primary mb-4`}>
          {config.title}
        </h1>
        {config.description && (
          <p className={`${embedded ? 'text-base' : 'text-lg'} text-neutral-600 dark:text-neutral-500 max-w-2xl`}>
            {config.description}
          </p>
        )}
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          {messages.photography.noItems}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className={`${embedded ? 'text-2xl' : 'text-4xl'} font-serif font-bold text-primary mb-4`}>
          {config.title}
        </h1>
        {config.description && (
          <p className={`${embedded ? 'text-base' : 'text-lg'} text-neutral-600 dark:text-neutral-500 max-w-2xl`}>
            {config.description}
          </p>
        )}
      </div>

      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-950 shadow-xl dark:border-neutral-800">
          <div
            className="relative aspect-[16/10] w-full"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeItem.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.28 }}
                className="absolute inset-0"
              >
                <Image
                  src={activeItem.image}
                  alt={activeItem.alt}
                  fill
                  priority
                  className="object-contain"
                  sizes="(max-width: 1024px) 100vw, 1200px"
                />
              </motion.div>
            </AnimatePresence>

            <div className="absolute right-4 top-4 rounded-full bg-black/45 px-3 py-1 text-xs tracking-[0.12em] text-white">
              {activeIndex + 1} / {items.length}
            </div>

            <button
              type="button"
              onClick={goPrev}
              disabled={!canGoPrev}
              aria-label={messages.photography.previous}
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/45 p-2 text-white transition-all',
                canGoPrev ? 'hover:bg-black/65' : 'cursor-not-allowed opacity-40'
              )}
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              aria-label={messages.photography.next}
              className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/45 p-2 text-white transition-all',
                canGoNext ? 'hover:bg-black/65' : 'cursor-not-allowed opacity-40'
              )}
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-serif font-semibold text-primary">
              {activeItem.title}
            </h2>
            {(activeItem.location || activeItem.date) && (
              <span className="text-sm text-neutral-500">
                {[activeItem.location, activeItem.date].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          {activeItem.description && (
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-500">
              {activeItem.description}
            </p>
          )}
          {(activeItem.camera || activeItem.lens) && (
            <dl className="mt-4 grid gap-4 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800 sm:grid-cols-2">
              {activeItem.camera && (
                <div>
                  <dt className="mb-1 text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                    {messages.photography.camera}
                  </dt>
                  <dd className="text-neutral-700 dark:text-neutral-300">{activeItem.camera}</dd>
                </div>
              )}
              {activeItem.lens && (
                <div>
                  <dt className="mb-1 text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                    {messages.photography.lens}
                  </dt>
                  <dd className="text-neutral-700 dark:text-neutral-300">{activeItem.lens}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  'overflow-hidden rounded-xl border bg-neutral-100 transition-all dark:bg-neutral-900',
                  index === activeIndex
                    ? 'border-accent shadow-md'
                    : 'border-neutral-200 dark:border-neutral-800'
                )}
              >
                <div className="relative h-20 w-32 sm:h-24 sm:w-40">
                  <Image
                    src={item.thumb}
                    alt={item.alt}
                    fill
                    className="object-cover"
                    sizes="160px"
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
