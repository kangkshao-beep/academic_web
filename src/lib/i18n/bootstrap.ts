import type { I18nRuntimeConfig } from '@/types/i18n';

export function buildLocaleBootstrapScript(config: I18nRuntimeConfig): string {
  const serializedConfig = JSON.stringify(config).replace(/</g, '\\u003c');

  return `
    try {
      const cfg = ${serializedConfig};
      const storageKey = 'locale-storage';
      const normalize = (value) => typeof value === 'string' ? value.trim().replace(/_/g, '-').toLowerCase() : '';
      const matchLocale = (candidate) => {
        const normalized = normalize(candidate);
        if (!normalized) return null;
        if (cfg.locales.includes(normalized)) return normalized;
        const subtags = normalized.split('-');
        const language = subtags[0];
        const script = subtags.slice(1).find((subtag) => /^[a-z]{4}$/.test(subtag));
        const region = subtags.slice(1).find((subtag) => /^[a-z]{2}$/.test(subtag) || /^\\d{3}$/.test(subtag));
        if (language === 'zh') {
          const usesTraditionalChinese = script === 'hant'
            || (!script && (region === 'hk' || region === 'mo' || region === 'tw'));
          if (usesTraditionalChinese && cfg.locales.includes('zh-hk')) return 'zh-hk';
        }
        if (cfg.locales.includes(language)) return language;
        return null;
      };
      const matchPreferredLocale = (candidates) => {
        for (const candidate of candidates) {
          const matched = matchLocale(candidate);
          if (matched) return matched;
        }
        return null;
      };

      let resolved = null;

      if (cfg.persist) {
        try {
          resolved = matchLocale(localStorage.getItem(storageKey));
        } catch (e) {}
      }

      if (!resolved) {
        if (cfg.mode === 'fixed') {
          resolved = cfg.fixedLocale;
        } else {
          const browserLocales = Array.isArray(navigator.languages) && navigator.languages.length
            ? navigator.languages
            : [navigator.language];
          resolved = matchPreferredLocale(browserLocales);
        }
      }

      if (!resolved) {
        resolved = cfg.defaultLocale;
      }

      const root = document.documentElement;
      root.lang = resolved;
      root.setAttribute('data-locale', resolved);

      if (cfg.persist) {
        try {
          localStorage.setItem(storageKey, resolved);
        } catch (e) {}
      }
    } catch (e) {
      const root = document.documentElement;
      root.lang = '${config.defaultLocale}';
      root.setAttribute('data-locale', '${config.defaultLocale}');
    }
  `;
}
