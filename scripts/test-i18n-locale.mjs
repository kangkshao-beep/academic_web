import assert from 'node:assert/strict';
import vm from 'node:vm';

import { buildLocaleBootstrapScript } from '../src/lib/i18n/bootstrap.ts';
import { matchLocale, matchPreferredLocale } from '../src/lib/i18n/config.ts';

const locales = ['en', 'zh', 'zh-hk'];
const config = {
  enabled: true,
  locales,
  defaultLocale: 'en',
  mode: 'auto',
  fixedLocale: 'en',
  persist: true,
  switcher: true,
  labels: {},
};

const localeCases = [
  ['zh-TW', 'zh-hk'],
  ['zh-MO', 'zh-hk'],
  ['zh-Hant', 'zh-hk'],
  ['zh-Hant-CN', 'zh-hk'],
  ['zh-CN', 'zh'],
  ['zh-SG', 'zh'],
  ['zh-Hans', 'zh'],
  ['zh-Hans-HK', 'zh'],
  ['en', 'en'],
  ['en-US', 'en'],
];

for (const [candidate, expected] of localeCases) {
  assert.equal(matchLocale(candidate, locales), expected, `${candidate} should map to ${expected}`);
}

assert.equal(
  matchPreferredLocale(['fr-FR', 'zh-MO', 'en-US'], locales),
  'zh-hk',
  'the first supported browser preference should win'
);

function runBootstrap({
  language,
  languages = [language],
  persisted = null,
  storageThrows = false,
  runtimeConfig = config,
}) {
  const storage = new Map();
  if (persisted) storage.set('locale-storage', persisted);

  const root = {
    lang: '',
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  };

  const context = {
    navigator: { language, languages },
    document: { documentElement: root },
    localStorage: {
      getItem(key) {
        if (storageThrows) throw new Error('storage unavailable');
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (storageThrows) throw new Error('storage unavailable');
        storage.set(key, value);
      },
    },
  };

  vm.runInNewContext(buildLocaleBootstrapScript(runtimeConfig), context);
  return {
    locale: root.attributes.get('data-locale'),
    lang: root.lang,
    persisted: storage.get('locale-storage'),
  };
}

for (const [candidate, expected] of localeCases) {
  const result = runBootstrap({ language: candidate });
  assert.equal(result.locale, expected, `bootstrap should map ${candidate} to ${expected}`);
  assert.equal(result.lang, expected, `bootstrap should set lang for ${candidate}`);
}

assert.equal(
  runBootstrap({ language: 'en-US', languages: ['fr-FR', 'zh-TW', 'en-US'] }).locale,
  'zh-hk',
  'bootstrap should inspect all browser language preferences'
);
assert.equal(
  runBootstrap({ language: 'zh-TW', persisted: 'en' }).locale,
  'en',
  'an explicit persisted choice should take priority'
);
assert.equal(
  runBootstrap({ language: 'zh-MO', storageThrows: true }).locale,
  'zh-hk',
  'browser detection should still work when storage is unavailable'
);

process.stdout.write('Locale matching and pre-paint bootstrap checks passed.\n');
