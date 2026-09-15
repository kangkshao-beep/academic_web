const ROOT_KEYS = ['schema_version', 'visibility', 'generated_on', 'current_topic_id', 'topics'];
const TOPIC_KEYS = ['id', 'phase', 'reference_ids', 'locales'];
const LOCALE_KEYS = ['en', 'zh', 'zh-hk'];
const CONTENT_KEYS = ['title', 'eyebrow', 'question', 'why_now', 'scope', 'plan', 'deliverable', 'guardrail'];
const TITLE_KEYS = ['before', 'focus', 'after'];
const PLAN_KEYS = ['label', 'body'];
const TOPIC_ID = /^weekly-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAPER_ID = /^[a-z][A-Za-z0-9_-]*$/;

function fail(path) {
  throw new Error(`Invalid weekly field: ${path}`);
}

function record(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path);
  return value;
}

function exact(value, keys, path) {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) fail(path);
}

function list(value, path) {
  if (!Array.isArray(value)) fail(path);
  return value;
}

function text(value, path, { empty = false, max = 1600 } = {}) {
  if (typeof value !== 'string' || value.length > max || value.includes('\u0000') || (!empty && !value.trim())) {
    fail(path);
  }
  return value;
}

function unique(values, path) {
  if (new Set(values).size !== values.length) fail(path);
}

function title(value, locale, path) {
  const input = record(value, path);
  exact(input, TITLE_KEYS, path);
  const output = {
    before: text(input.before, `${path}.before`, { empty: true, max: 100 }),
    focus: text(input.focus, `${path}.focus`, { max: 80 }),
    after: text(input.after, `${path}.after`, { empty: true, max: 100 }),
  };
  const focusLength = Array.from(output.focus.trim()).length;
  if (locale === 'en') {
    const words = output.focus.trim().split(/\s+/);
    if (words.length < 1 || words.length > 3) fail(`${path}.focus`);
  } else if (focusLength < 2 || focusLength > 5 || /\s/.test(output.focus)) {
    fail(`${path}.focus`);
  }
  if (`${output.before}${output.focus}${output.after}`.trim().length > 180) fail(path);
  return output;
}

function date(value, path) {
  const result = text(value, path, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) fail(path);
  const parsed = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) fail(path);
  return result;
}

function localized(value, locale, path) {
  const input = record(value, path);
  exact(input, CONTENT_KEYS, path);
  const plan = list(input.plan, `${path}.plan`);
  if (plan.length !== 4) fail(`${path}.plan`);
  return {
    title: title(input.title, locale, `${path}.title`),
    eyebrow: text(input.eyebrow, `${path}.eyebrow`, { max: 120 }),
    question: text(input.question, `${path}.question`),
    why_now: text(input.why_now, `${path}.why_now`),
    scope: text(input.scope, `${path}.scope`),
    plan: plan.map((entry, index) => {
      const itemPath = `${path}.plan[${index}]`;
      const item = record(entry, itemPath);
      exact(item, PLAN_KEYS, itemPath);
      return {
        label: text(item.label, `${itemPath}.label`, { max: 100 }),
        body: text(item.body, `${itemPath}.body`),
      };
    }),
    deliverable: text(input.deliverable, `${path}.deliverable`),
    guardrail: text(input.guardrail, `${path}.guardrail`),
  };
}

export function validateWeeklyTopics(value) {
  const input = record(value, 'weekly');
  exact(input, ROOT_KEYS, 'weekly');
  if (input.schema_version !== '1.0.0' || input.visibility !== 'private') fail('weekly');
  const generatedOn = date(input.generated_on, 'weekly.generated_on');
  const topics = list(input.topics, 'weekly.topics').map((entry, index) => {
    const path = `weekly.topics[${index}]`;
    const item = record(entry, path);
    exact(item, TOPIC_KEYS, path);
    const id = text(item.id, `${path}.id`, { max: 96 });
    if (!TOPIC_ID.test(id) || !['current', 'candidate', 'archive'].includes(item.phase)) fail(path);
    const references = list(item.reference_ids, `${path}.reference_ids`).map((reference, referenceIndex) => {
      const result = text(reference, `${path}.reference_ids[${referenceIndex}]`, { max: 96 });
      if (!PAPER_ID.test(result)) fail(`${path}.reference_ids[${referenceIndex}]`);
      return result;
    });
    if (references.length < 3 || references.length > 6) fail(`${path}.reference_ids`);
    unique(references, `${path}.reference_ids`);
    const localeInput = record(item.locales, `${path}.locales`);
    exact(localeInput, LOCALE_KEYS, `${path}.locales`);
    return {
      id,
      phase: item.phase,
      reference_ids: references,
      locales: Object.fromEntries(LOCALE_KEYS.map((locale) => [
        locale,
        localized(localeInput[locale], locale, `${path}.locales.${locale}`),
      ])),
    };
  });
  if (topics.length < 3 || topics.length > 12) fail('weekly.topics');
  unique(topics.map((topic) => topic.id), 'weekly.topics.id');
  const currentTopicId = text(input.current_topic_id, 'weekly.current_topic_id', { max: 96 });
  const current = topics.filter((topic) => topic.phase === 'current');
  if (current.length !== 1 || current[0].id !== currentTopicId) fail('weekly.current_topic_id');
  return {
    schema_version: '1.0.0',
    visibility: 'private',
    generated_on: generatedOn,
    current_topic_id: currentTopicId,
    topics,
  };
}
