import type { WeeklyLocale, WeeklyUniverseBundle } from '../weekly/types';

export const STATUSES = ['unknown', 'planned', 'in_progress', 'completed', 'paused'] as const;
export type TopicStatus = (typeof STATUSES)[number];
export type Locale = WeeklyLocale;
export interface TopicLink {
  id: string;
  title: string;
  url: string;
}
export interface TopicContent {
  shortTitle: string;
  title: string;
  category: string;
  summary: string;
  motivation?: string;
  startingPoint?: string;
  workPlan?: string;
  checks?: string;
  results?: string;
  openQuestions?: string;
  nextSteps?: string;
  notesMarkdown?: string;
}
export interface ResearchTopic extends TopicContent {
  id: string;
  tags: string[];
  status: TopicStatus;
  date: string | null;
  references: TopicLink[];
  artifacts: TopicLink[];
  relatedTopicIds: string[];
  createdAt?: string;
  updatedAt?: string;
  completedAt: string | null;
  source: string;
  isDemo: boolean;
  locales?: Partial<Record<Locale, TopicContent>>;
}
export interface UniverseDataset {
  schemaVersion: 1;
  datasetId: string;
  datasetKind: 'demo' | 'private';
  topics: ResearchTopic[];
}
export interface TopicChange {
  status: TopicStatus;
  notesMarkdown: string;
  updatedAt: string;
  completedAt: string | null;
}
export type Progress = Record<string, TopicChange>;
export const localized = (topic: ResearchTopic, locale: Locale): ResearchTopic => ({
  ...topic,
  ...topic.locales?.[locale],
  notesMarkdown: topic.notesMarkdown,
});
export const say = (locale: Locale, en: string, zh: string, hk = zh) =>
  locale === 'en' ? en : locale === 'zh-hk' ? hk : zh;
export const statusLabel = (s: TopicStatus, l: Locale) =>
  ({
    unknown: say(l, 'Unknown', '未知'),
    planned: say(l, 'Planned', '已计划', '已計劃'),
    in_progress: say(l, 'In progress', '进行中', '進行中'),
    completed: say(l, 'Completed', '已完成'),
    paused: say(l, 'Paused', '已暂停', '已暫停'),
  })[s];
export const STATUS_SYMBOL: Record<TopicStatus, string> = {
  unknown: '◇',
  planned: '○',
  in_progress: '◐',
  completed: '✓',
  paused: 'Ⅱ',
};

export function adaptWeekly(bundle: WeeklyUniverseBundle): UniverseDataset {
  return {
    schemaVersion: 1,
    datasetId: 'weekly-server',
    datasetKind: 'private',
    topics: bundle.universe.topics.map((topic) => {
      const locales = Object.fromEntries(
        Object.entries(topic.locales).map(([locale, value]) => [
          locale,
          {
            shortTitle: value.title.focus,
            title: [value.title.before, value.title.focus, value.title.after]
              .filter(Boolean)
              .join(locale === 'en' ? ' ' : ''),
            category: value.eyebrow,
            summary: value.question,
            motivation: value.why_now,
            startingPoint: value.scope,
            workPlan: value.plan
              .map((step, i) => `${i + 1}. **${step.label}**\n\n   ${step.body}`)
              .join('\n\n'),
            checks: value.guardrail,
            nextSteps: value.deliverable,
          },
        ])
      ) as Record<Locale, TopicContent>;
      return {
        ...locales.en,
        id: topic.id,
        tags: [topic.phase],
        status: 'unknown',
        date: null,
        references: topic.reference_ids.map((id) => ({
          id,
          title: bundle.papers[id].title,
          url: `/reading/#paper-${encodeURIComponent(id)}`,
        })),
        artifacts: [],
        relatedTopicIds: [],
        completedAt: null,
        source: '/reading/weekly/data/topics.json',
        isDemo: false,
        locales,
      };
    }),
  };
}

// An ID-based lattice stays stable when another topic is added or filtered out.
export function topicPosition(id: string): [number, number, number] {
  let hash = 2166136261;
  for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const u = (hash >>> 0) / 4294967296;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  const v = (hash >>> 0) / 4294967296;
  const angle = u * Math.PI * 2;
  return [Math.cos(angle) * (5 + v * 2.5), (v - 0.5) * 8, Math.sin(angle) * 4.5];
}

export function applyProgress(dataset: UniverseDataset, progress: Progress): UniverseDataset {
  return {
    ...dataset,
    topics: dataset.topics.map((topic) => ({ ...topic, ...progress[topic.id] })),
  };
}
export function changeTopic(
  topic: ResearchTopic,
  status: TopicStatus,
  notesMarkdown: string,
  now = new Date().toISOString()
): TopicChange {
  return {
    status,
    notesMarkdown,
    updatedAt: now,
    completedAt: status === 'completed' ? topic.completedAt || now : null,
  };
}
