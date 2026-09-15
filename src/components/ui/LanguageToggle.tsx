'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { LanguageIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/lib/stores/localeStore';
import { useMessages } from '@/lib/i18n/useMessages';
import type { I18nRuntimeConfig } from '@/types/i18n';

interface LanguageToggleProps {
  i18n: I18nRuntimeConfig;
}

function getCompactLabel(locale: string, label: string): string {
  return locale === 'zh-hk' ? '繁中（港）' : label;
}

export default function LanguageToggle({ i18n }: LanguageToggleProps) {
  const { locale, setLocale } = useLocaleStore();
  const messages = useMessages();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!i18n.enabled || !i18n.switcher || i18n.locales.length <= 1) {
    return null;
  }

  if (!mounted) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-background dark:border-[rgba(148,163,184,0.24)] dark:bg-neutral-800 sm:w-20">
        <div className="w-6 h-4 rounded bg-neutral-300 animate-pulse" />
      </div>
    );
  }

  const currentLocale = i18n.locales.includes(locale) ? locale : i18n.defaultLocale;
  const currentLabel = i18n.labels[currentLocale] || currentLocale;
  const compactLabel = getCompactLabel(currentLocale, currentLabel);
  const triggerLabel = `${messages.search.language}: ${currentLabel}`;

  const focusOption = (index: number) => {
    const count = i18n.locales.length;
    optionRefs.current[(index + count) % count]?.focus();
  };

  const openMenu = (target: 'selected' | 'first' | 'last' = 'selected') => {
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      const selectedIndex = Math.max(0, i18n.locales.indexOf(currentLocale));
      focusOption(target === 'first' ? 0 : target === 'last' ? i18n.locales.length - 1 : selectedIndex);
    });
  };

  const closeMenu = (restoreFocus = true) => {
    setIsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
    }
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closeMenu();
    }
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusOption(i18n.locales.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (isOpen && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
    >
      <motion.button
        ref={triggerRef}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        type="button"
        onClick={() => (isOpen ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        aria-label={triggerLabel}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={menuId}
        data-testid="language-toggle"
        className={cn(
          'flex h-10 w-10 items-center justify-center gap-1 rounded-lg sm:w-auto sm:px-2',
          'border border-neutral-200 bg-background hover:bg-neutral-50',
          'dark:border-[rgba(148,163,184,0.24)] dark:bg-neutral-800 dark:hover:bg-neutral-700',
          'transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          'text-neutral-600 hover:text-primary dark:text-neutral-400 dark:hover:text-white'
        )}
        title={triggerLabel}
      >
        <LanguageIcon className="h-4 w-4" aria-hidden="true" />
        <span className="hidden text-xs font-medium sm:inline" aria-hidden="true">{compactLabel}</span>
        <ChevronDownIcon className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
      </motion.button>

      {isOpen && (
        <motion.div
          id={menuId}
          role="menu"
          aria-label={messages.search.language}
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          className={cn(
            'absolute right-0 z-50 mt-2 w-48 rounded-lg border shadow-lg',
            'bg-background border-neutral-200 dark:border-[rgba(148,163,184,0.24)]',
            'dark:bg-neutral-800 z-50'
          )}
        >
          <div className="py-1">
            {i18n.locales.map((localeOption, index) => (
              <button
                key={localeOption}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="menuitemradio"
                aria-checked={currentLocale === localeOption}
                tabIndex={currentLocale === localeOption ? 0 : -1}
                onClick={() => {
                  setLocale(localeOption);
                  closeMenu();
                }}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                className={cn(
                  'flex w-full items-center justify-between whitespace-nowrap px-3 py-2 text-sm',
                  'hover:bg-neutral-50 dark:hover:bg-neutral-700',
                  'transition-colors duration-200',
                  currentLocale === localeOption
                    ? 'text-accent bg-accent/10'
                    : 'text-neutral-700 dark:text-neutral-300'
                )}
              >
                <span>{i18n.labels[localeOption] || localeOption}</span>
                <span className="text-xs opacity-70">{localeOption.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => closeMenu()}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
