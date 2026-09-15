import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { projectReadingPublicFile } from '../functions/reading/_public-data.mjs';
import { validateWeeklyTopics } from '../functions/reading/weekly/_contract.mjs';

async function transpile(relativeUrl, importMap = {}) {
  const fileUrl = new URL(relativeUrl, import.meta.url);
  let source = await readFile(fileUrl, 'utf8');
  for (const [specifier, replacement] of Object.entries(importMap)) {
    source = source.replaceAll(`'${specifier}'`, `'${replacement}'`);
  }
  const result = ts.transpileModule(source, {
    fileName: fileUrl.pathname,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(result.outputText, 'utf8').toString('base64')}`;
}

const typesModule = await transpile('../src/lib/reading/weekly/types.ts');
const validatorModule = await transpile('../src/lib/reading/weekly/validate.ts', {
  './types': typesModule,
});
const { validateWeeklyBundle, WeeklyDataError } = await import(validatorModule);
const topics = JSON.parse(await readFile(
  new URL('../tests/fixtures/reading-weekly/topics.json', import.meta.url),
  'utf8'
));
const privateLibrary = JSON.parse(await readFile(
  new URL('../tests/fixtures/reading/library.json', import.meta.url),
  'utf8'
));
const library = projectReadingPublicFile('library.json', privateLibrary, 'private');

const bundle = validateWeeklyBundle(topics, library);
assert.deepEqual(validateWeeklyTopics(topics), topics);
assert.equal(bundle.universe.topics.length, 4);
assert.equal(bundle.universe.topics.filter((topic) => topic.phase === 'current').length, 1);
assert.deepEqual(Object.keys(bundle.universe.topics[0].locales), ['en', 'zh', 'zh-hk']);

const cases = [
  ['public visibility', (value) => { value.visibility = 'public'; }],
  ['unknown root field', (value) => { value.private_extension = 'SYNTHETIC_WEEKLY_SECRET'; }],
  ['missing locale', (value) => { delete value.topics[0].locales['zh-hk']; }],
  ['oversized Chinese focus', (value) => { value.topics[0].locales.zh.title.focus = '超过五个汉字焦点'; }],
  ['impossible calendar date', (value) => { value.generated_on = '2026-02-31'; }],
  ['oversized full title', (value) => {
    value.topics[0].locales.en.title.before = 'a'.repeat(100);
    value.topics[0].locales.en.title.after = 'b'.repeat(100);
  }],
  ['three-step plan', (value) => { value.topics[0].locales.en.plan.pop(); }],
  ['duplicate reference', (value) => { value.topics[0].reference_ids[1] = value.topics[0].reference_ids[0]; }],
  ['second current topic', (value) => { value.topics[1].phase = 'current'; }],
  ['dangling reference', (value) => { value.topics[0].reference_ids[0] = 'missingPaper'; }],
];

for (const [label, mutate] of cases) {
  const candidate = structuredClone(topics);
  mutate(candidate);
  assert.throws(
    () => validateWeeklyBundle(candidate, library),
    (error) => error instanceof WeeklyDataError && !error.message.includes('SYNTHETIC_WEEKLY_SECRET'),
    `${label} was accepted by the weekly validator.`
  );
  if (label !== 'dangling reference') {
    assert.throws(
      () => validateWeeklyTopics(candidate),
      (error) => error instanceof Error && !error.message.includes('SYNTHETIC_WEEKLY_SECRET'),
      `${label} was accepted by the server weekly contract.`
    );
  }
}

process.stdout.write('Weekly topic validator checks passed (shape, locales, focus sizing, plans, references, and invariants).\n');
