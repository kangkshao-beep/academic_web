export const WEEKLY_SCHEMA_VERSION = '1.0.0' as const;

export type WeeklyLocale = 'en' | 'zh' | 'zh-hk';
export type WeeklyTopicPhase = 'current' | 'candidate' | 'archive';

export interface WeeklyTitleParts {
  before: string;
  focus: string;
  after: string;
}

export interface WeeklyPlanStep {
  label: string;
  body: string;
}

export interface WeeklyLocalizedTopic {
  title: WeeklyTitleParts;
  eyebrow: string;
  question: string;
  why_now: string;
  scope: string;
  plan: WeeklyPlanStep[];
  deliverable: string;
  guardrail: string;
}

export interface WeeklyTopic {
  id: string;
  phase: WeeklyTopicPhase;
  reference_ids: string[];
  locales: Record<WeeklyLocale, WeeklyLocalizedTopic>;
}

export interface WeeklyUniverseData {
  schema_version: typeof WEEKLY_SCHEMA_VERSION;
  visibility: 'private';
  generated_on: string;
  current_topic_id: string;
  topics: WeeklyTopic[];
}

export interface WeeklyPaperReference {
  id: string;
  title: string;
  year: number;
}

export interface WeeklyUniverseBundle {
  universe: WeeklyUniverseData;
  papers: Record<string, WeeklyPaperReference>;
}
