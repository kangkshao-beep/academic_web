'use client';

import { useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocaleStore } from '@/lib/stores/localeStore';
import type { I18nRuntimeConfig } from '@/types/i18n';

interface LocaleProviderProps {
  config: I18nRuntimeConfig;
  children: ReactNode;
}

export function LocaleProvider({ config, children }: LocaleProviderProps) {
  const initialize = useLocaleStore((state) => state.initialize);

  useLayoutEffect(() => {
    initialize(config);
  }, [initialize, config]);

  return <>{children}</>;
}
