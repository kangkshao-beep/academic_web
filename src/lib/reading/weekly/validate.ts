import {
  WEEKLY_SCHEMA_VERSION,
  type WeeklyLocale,
  type WeeklyLocalizedTopic,
  type WeeklyPaperReference,
  type WeeklyPlanStep,
  type WeeklyTitleParts,
  type WeeklyTopic,
  type WeeklyTopicPhase,
  type WeeklyUniverseBundle,
  type WeeklyUniverseData,
} from './types';

type JsonRecord = Record<string, unknown>;

const LOCALES: WeeklyLocale[] = ['en', 'zh', 'zh-hk'];
const PHASES: WeeklyTopicPhase[] = ['current', 'candidate', 'archive'];
const ROOT_KEYS = ['schema_version', 'visibility', 'generated_on', 'current_topic_id', 'topics'];
const TOPIC_KEYS = ['id', 'phase', 'reference_ids', 'locales'];
const LOCALIZED_KEYS = ['title', 'eyebrow', 'question', 'why_now', 'scope', 'plan', 'deliverable', 'guardrail'];
const TITLE_KEYS = ['before', 'focus', 'after'];
const PLAN_KEYS = ['label', 'body'];
const TOPIC_ID_PATTERN = /^weekly-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAPER_ID_PATTERN = /^[a-z][A-Za-z0-9_-]*$/;

export class WeeklyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeeklyDataError';
  }
}

function invalid(path: string): never {
  throw new WeeklyDataError(`Invalid weekly topic field: ${path}`);
}

function object(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, allowed: readonly string[], path: string): void {
  const keys = Object.keys(value);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) invalid(path);
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path);
  return value;
}

function text(value: unknown, path: string, { allowEmpty = false, max = 1600 } = {}): string {
  if (
    typeof value !== 'string'
    || value.length > max
    || /[\u0000]/.test(value)
    || (!allowEmpty && value.trim() === '')
  ) invalid(path);
  return value;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) invalid(path);
  return value as T;
}

function date(value: unknown, path: string): string {
  const result = text(value, path, { max: 10 });
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result);
  if (!match) invalid(path);
  const parsed = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== result) invalid(path);
  return result;
}

function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) invalid(path);
}

function parseTitle(value: unknown, locale: WeeklyLocale, path: string): WeeklyTitleParts {
  const item = object(value, path);
  exactKeys(item, TITLE_KEYS, path);
  const title = {
    before: text(item.before, `${path}.before`, { allowEmpty: true, max: 100 }),
    focus: text(item.focus, `${path}.focus`, { max: 80 }),
    after: text(item.after, `${path}.after`, { allowEmpty: true, max: 100 }),
  };
  const focusLength = Array.from(title.focus.trim()).length;
  if (locale === 'en') {
    const words = title.focus.trim().split(/\s+/);
    if (words.length < 1 || words.length > 3) invalid(`${path}.focus`);
  } else if (focusLength < 2 || focusLength > 5 || /\s/.test(title.focus)) {
    invalid(`${path}.focus`);
  }
  if (`${title.before}${title.focus}${title.after}`.trim().length > 180) invalid(path);
  return title;
}

function parsePlan(value: unknown, path: string): WeeklyPlanStep[] {
  const items = list(value, path);
  if (items.length !== 4) invalid(path);
  return items.map((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const item = object(entry, itemPath);
    exactKeys(item, PLAN_KEYS, itemPath);
    return {
      label: text(item.label, `${itemPath}.label`, { max: 100 }),
      body: text(item.body, `${itemPath}.body`),
    };
  });
}

function parseLocalized(value: unknown, locale: WeeklyLocale, path: string): WeeklyLocalizedTopic {
  const item = object(value, path);
  exactKeys(item, LOCALIZED_KEYS, path);
  return {
    title: parseTitle(item.title, locale, `${path}.title`),
    eyebrow: text(item.eyebrow, `${path}.eyebrow`, { max: 120 }),
    question: text(item.question, `${path}.question`),
    why_now: text(item.why_now, `${path}.why_now`),
    scope: text(item.scope, `${path}.scope`),
    plan: parsePlan(item.plan, `${path}.plan`),
    deliverable: text(item.deliverable, `${path}.deliverable`),
    guardrail: text(item.guardrail, `${path}.guardrail`),
  };
}

function parseTopic(value: unknown, index: number): WeeklyTopic {
  const path = `weekly.topics[${index}]`;
  const item = object(value, path);
  exactKeys(item, TOPIC_KEYS, path);
  const id = text(item.id, `${path}.id`, { max: 96 });
  if (!TOPIC_ID_PATTERN.test(id)) invalid(`${path}.id`);

  const referenceIds = list(item.reference_ids, `${path}.reference_ids`).map((value, referenceIndex) => {
    const reference = text(value, `${path}.reference_ids[${referenceIndex}]`, { max: 96 });
    if (!PAPER_ID_PATTERN.test(reference)) invalid(`${path}.reference_ids[${referenceIndex}]`);
    return reference;
  });
  if (referenceIds.length < 3 || referenceIds.length > 6) invalid(`${path}.reference_ids`);
  unique(referenceIds, `${path}.reference_ids`);

  const localeRecord = object(item.locales, `${path}.locales`);
  exactKeys(localeRecord, LOCALES, `${path}.locales`);
  const locales = Object.fromEntries(LOCALES.map((locale) => [
    locale,
    parseLocalized(localeRecord[locale], locale, `${path}.locales.${locale}`),
  ])) as Record<WeeklyLocale, WeeklyLocalizedTopic>;

  return {
    id,
    phase: oneOf(item.phase, PHASES, `${path}.phase`),
    reference_ids: referenceIds,
    locales,
  };
}

export function validateWeeklyUniverse(value: unknown): WeeklyUniverseData {
  const item = object(value, 'weekly');
  exactKeys(item, ROOT_KEYS, 'weekly');
  const topics = list(item.topics, 'weekly.topics').map(parseTopic);
  if (topics.length < 3 || topics.length > 12) invalid('weekly.topics');
  unique(topics.map((topic) => topic.id), 'weekly.topics.id');

  const currentTopicId = text(item.current_topic_id, 'weekly.current_topic_id', { max: 96 });
  const currentTopics = topics.filter((topic) => topic.phase === 'current');
  if (currentTopics.length !== 1 || currentTopics[0].id !== currentTopicId) {
    invalid('weekly.current_topic_id');
  }

  return {
    schema_version: oneOf(item.schema_version, [WEEKLY_SCHEMA_VERSION], 'weekly.schema_version'),
    visibility: oneOf(item.visibility, ['private'], 'weekly.visibility'),
    generated_on: date(item.generated_on, 'weekly.generated_on'),
    current_topic_id: currentTopicId,
    topics,
  };
}

export function validateWeeklyPaperIndex(value: unknown): Record<string, WeeklyPaperReference> {
  const library = object(value, 'library');
  if (library.visibility !== 'public') invalid('library.visibility');
  const papers = list(library.papers, 'library.papers');
  const result: Record<string, WeeklyPaperReference> = {};
  for (const [index, entry] of papers.entries()) {
    const path = `library.papers[${index}]`;
    const paper = object(entry, path);
    const id = text(paper.id, `${path}.id`, { max: 96 });
    if (!PAPER_ID_PATTERN.test(id) || Object.hasOwn(result, id)) invalid(`${path}.id`);
    if (!Number.isInteger(paper.year) || (paper.year as number) < 1900 || (paper.year as number) > 2200) {
      invalid(`${path}.year`);
    }
    result[id] = {
      id,
      title: text(paper.title, `${path}.title`, { max: 500 }),
      year: paper.year as number,
    };
  }
  if (Object.keys(result).length === 0) invalid('library.papers');
  return result;
}

export function validateWeeklyBundle(topics: unknown, library: unknown): WeeklyUniverseBundle {
  const universe = validateWeeklyUniverse(topics);
  const papers = validateWeeklyPaperIndex(library);
  for (const [topicIndex, topic] of universe.topics.entries()) {
    for (const reference of topic.reference_ids) {
      if (!Object.hasOwn(papers, reference)) invalid(`weekly.topics[${topicIndex}].reference_ids`);
    }
  }
  return { universe, papers };
}
