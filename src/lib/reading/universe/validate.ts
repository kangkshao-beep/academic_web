import {
  STATUSES,
  type ResearchTopic,
  type TopicContent,
  type TopicLink,
  type UniverseDataset,
  type Progress,
} from './model';

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/;
const fields = [
  'shortTitle',
  'title',
  'category',
  'summary',
  'motivation',
  'startingPoint',
  'workPlan',
  'checks',
  'results',
  'openQuestions',
  'nextSteps',
  'notesMarkdown',
] as const;
function fail(field: string): never {
  throw new Error(`Invalid field / 无效字段：${field}`);
}
function record(v: unknown, field: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(field);
  return v as Record<string, unknown>;
}
function text(v: unknown, field: string, max = 20000): string {
  if (typeof v !== 'string' || v.length > max || /\u0000/.test(v)) fail(field);
  return v;
}
function id(v: unknown, field: string): string {
  const value = text(v, field, 96);
  if (!ID.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) fail(field);
  return value;
}
export function safeUrl(v: string): string | null {
  if (/^\/reading\/(?:#[A-Za-z0-9_%.-]+)?$/.test(v)) return v;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}
function date(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = text(v, field, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s.slice(0, 10)
  )
    fail(field);
  return s;
}
function list(v: unknown, field: string, max = 100): unknown[] {
  if (!Array.isArray(v) || v.length > max) fail(field);
  return v;
}
function links(v: unknown, field: string): TopicLink[] {
  return list(v ?? [], field).map((link, i) => {
    const r = record(link, field);
    const url = text(r.url, `${field}.${i}.url`, 2048);
    if (!safeUrl(url)) fail(`${field}.${i}.url`);
    return {
      id: id(r.id, `${field}.${i}.id`),
      title: text(r.title, `${field}.${i}.title`, 300),
      url,
    };
  });
}
function content(r: Record<string, unknown>, path: string): TopicContent {
  const result: Record<string, string> = {};
  for (const field of fields)
    if (r[field] !== undefined)
      result[field] = text(
        r[field],
        `${path}.${field}`,
        ['shortTitle', 'title', 'category'].includes(field) ? 300 : 20000
      );
  for (const field of ['shortTitle', 'title', 'category'])
    if (!result[field]?.trim()) fail(`${path}.${field}`);
  result.summary ??= '';
  return result as unknown as TopicContent;
}
export function validateDataset(value: unknown): UniverseDataset {
  const root = record(value, 'dataset');
  if (root.schemaVersion !== 1) fail('schemaVersion');
  if (root.datasetKind !== 'demo' && root.datasetKind !== 'private') fail('datasetKind');
  const ids = new Set<string>();
  const topics = list(root.topics, 'topics', 500).map((value, index): ResearchTopic => {
    const p = `topics[${index}]`;
    const r = record(value, p);
    const topicId = id(r.id, `${p}.id`);
    if (ids.has(topicId)) fail(`${p}.id (duplicate / 重复)`);
    ids.add(topicId);
    const status = r.status ?? 'unknown';
    if (!STATUSES.includes(status as never)) fail(`${p}.status`);
    if (r.isDemo !== (root.datasetKind === 'demo')) fail(`${p}.isDemo`);
    const completedAt = date(r.completedAt, `${p}.completedAt`);
    if (status !== 'completed' && completedAt !== null) fail(`${p}.completedAt`);
    const locales: ResearchTopic['locales'] = {};
    if (r.locales)
      for (const [l, v] of Object.entries(record(r.locales, `${p}.locales`))) {
        if (!['en', 'zh', 'zh-hk'].includes(l)) fail(`${p}.locales`);
        locales[l as keyof typeof locales] = content(record(v, p), p);
      }
    return {
      ...content(r, p),
      id: topicId,
      status: status as ResearchTopic['status'],
      date: date(r.date, `${p}.date`),
      createdAt: date(r.createdAt, `${p}.createdAt`) ?? undefined,
      updatedAt: date(r.updatedAt, `${p}.updatedAt`) ?? undefined,
      tags: list(r.tags ?? [], `${p}.tags`).map((v) => text(v, p, 100)),
      references: links(r.references, `${p}.references`),
      artifacts: links(r.artifacts, `${p}.artifacts`),
      relatedTopicIds: list(r.relatedTopicIds ?? [], `${p}.relatedTopicIds`).map((v) => id(v, p)),
      completedAt,
      source: text(r.source ?? '', `${p}.source`, 500),
      isDemo: r.isDemo as boolean,
      locales,
    };
  });
  for (const topic of topics)
    for (const target of topic.relatedTopicIds)
      if (!ids.has(target) || target === topic.id) fail(`${topic.id}.relatedTopicIds`);
  return {
    schemaVersion: 1,
    datasetId: id(root.datasetId, 'datasetId'),
    datasetKind: root.datasetKind,
    topics,
  };
}
export function mergeDataset(
  current: UniverseDataset,
  incoming: UniverseDataset,
  conflict: 'keep' | 'replace'
): UniverseDataset {
  if (current.datasetKind !== incoming.datasetKind)
    throw new Error('DEMO and private records cannot be merged / 演示与私人记录不能合并');
  const topics = new Map(current.topics.map((t) => [t.id, t]));
  for (const topic of incoming.topics)
    if (conflict === 'replace' || !topics.has(topic.id)) topics.set(topic.id, topic);
  return validateDataset({ ...incoming, topics: [...topics.values()] });
}
export const storageKey = (dataset: UniverseDataset) =>
  `prism-research-universe:v1:${dataset.datasetKind}:${dataset.datasetId}`;
export function readProgress(raw: string | null): Progress {
  if (!raw) return {};
  const root = record(JSON.parse(raw), 'progress');
  const result: Progress = {};
  for (const [key, value] of Object.entries(root)) {
    id(key, 'progress.id');
    const r = record(value, 'progress');
    if (!STATUSES.includes(r.status as never)) fail('progress.status');
    const completedAt = date(r.completedAt, 'progress.completedAt');
    if (r.status !== 'completed' && completedAt) fail('progress.completedAt');
    const updatedAt = date(r.updatedAt, 'progress.updatedAt');
    if (!updatedAt) fail('progress.updatedAt');
    result[key] = {
      status: r.status as ResearchTopic['status'],
      notesMarkdown: text(r.notesMarkdown ?? '', 'progress.notesMarkdown'),
      updatedAt,
      completedAt,
    };
  }
  return result;
}
