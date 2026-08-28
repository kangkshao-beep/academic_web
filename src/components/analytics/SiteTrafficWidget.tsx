'use client';

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

  if (!stats) return null;

  const weeklyViews = numberFormatter.format(stats.weekly);
  const totalViews = numberFormatter.format(stats.total);
  const accessibleLabel = `${messages.traffic.label}: ${messages.traffic.weeklyViews} ${weeklyViews}; ${messages.traffic.totalViews} ${totalViews}`;

  return (
    <span
      aria-label={accessibleLabel}
      aria-live="polite"
      className="ml-3 inline-flex max-w-full flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 border-l border-neutral-300 pl-3 text-xs text-neutral-500 dark:border-neutral-700"
    >
      <span className="whitespace-nowrap">
        {messages.traffic.weeklyViews}: <strong className="font-semibold tabular-nums text-primary">{weeklyViews}</strong>
      </span>
      <span aria-hidden="true">·</span>
      <span className="whitespace-nowrap">
        {messages.traffic.totalViews}: <strong className="font-semibold tabular-nums text-primary">{totalViews}</strong>
      </span>
    </span>
  );
}
