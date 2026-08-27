'use client';

import { Eye } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMessages } from '@/lib/i18n/useMessages';
import { useLocaleStore } from '@/lib/stores/localeStore';

interface TrafficStats {
  weekly: number;
  total: number;
}

function isTrafficStats(value: unknown): value is TrafficStats {
  if (!value || typeof value !== 'object') return false;

  const stats = value as Partial<TrafficStats>;
  return typeof stats.weekly === 'number' && Number.isFinite(stats.weekly) && stats.weekly >= 0
    && typeof stats.total === 'number' && Number.isFinite(stats.total) && stats.total >= 0;
}

function getNumberLocale(locale: string): string {
  if (locale === 'zh') return 'zh-CN';
  if (locale === 'zh-hk') return 'zh-HK';
  return 'en-US';
}

export default function SiteTrafficWidget() {
  const pathname = usePathname();
  const locale = useLocaleStore((state) => state.locale);
  const messages = useMessages();
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [isFooterVisible, setIsFooterVisible] = useState(false);
  const requestIdRef = useRef(0);
  const pageKey = pathname || '/';

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(getNumberLocale(locale)),
    [locale]
  );

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    async function recordPageView() {
      try {
        const response = await fetch('/api/traffic', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Traffic request failed with ${response.status}.`);
        }

        const result: unknown = await response.json();
        if (!isTrafficStats(result)) {
          throw new Error('Traffic response has an invalid shape.');
        }

        if (!controller.signal.aborted && requestId === requestIdRef.current) {
          setStats(result);
        }
      } catch {
        if (!controller.signal.aborted && requestId === requestIdRef.current) {
          setStats(null);
        }
      }
    }

    void recordPageView();

    return () => controller.abort();
  }, [pageKey]);

  useEffect(() => {
    const footer = document.getElementById('site-footer');
    if (!footer || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsFooterVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );

    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  if (!stats) return null;

  const weeklyViews = numberFormatter.format(stats.weekly);
  const totalViews = numberFormatter.format(stats.total);
  const accessibleLabel = `${messages.traffic.label}: ${messages.traffic.weeklyViews} ${weeklyViews}; ${messages.traffic.totalViews} ${totalViews}`;

  return (
    <aside
      aria-hidden={isFooterVisible}
      aria-label={accessibleLabel}
      aria-live="polite"
      className={`pointer-events-none fixed z-30 max-w-[calc(100vw-2rem)] transition-opacity duration-200 ${
        isFooterVisible ? 'invisible opacity-0' : 'opacity-100'
      } bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]`}
    >
      <div className="flex w-[13rem] max-w-full items-center gap-2 rounded-md border border-neutral-200/80 bg-background/90 px-3 py-2.5 shadow-md backdrop-blur-md dark:border-neutral-700/80 dark:bg-neutral-900/90">
        <Eye className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <dl className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="whitespace-nowrap text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
              {messages.traffic.weeklyViews}
            </dt>
            <dd className="shrink-0 text-sm font-semibold tabular-nums text-primary">
              {weeklyViews}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="whitespace-nowrap text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
              {messages.traffic.totalViews}
            </dt>
            <dd className="shrink-0 text-sm font-semibold tabular-nums text-primary">
              {totalViews}
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
