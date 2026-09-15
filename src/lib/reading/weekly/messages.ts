import type { WeeklyLocale, WeeklyTopicPhase } from './types';

export interface WeeklyMessages {
  app: {
    eyebrow: string;
    title: string;
    description: string;
    back: string;
    privateNotice: string;
  };
  state: {
    loading: string;
    authTitle: string;
    authMessage: string;
    malformedTitle: string;
    malformedMessage: string;
    unavailableTitle: string;
    unavailableMessage: string;
    retry: string;
  };
  universe: {
    heading: string;
    label: string;
    openTopic: (title: string) => string;
    pauseMotion: string;
    resumeMotion: string;
    phase: Record<WeeklyTopicPhase, string>;
  };
  detail: {
    question: string;
    whyNow: string;
    scope: string;
    weeklyRoute: string;
    references: string;
    openReference: (title: string, year: number) => string;
    deliverable: string;
    guardrail: string;
    proposalNotice: string;
  };
}

const en: WeeklyMessages = {
  app: {
    eyebrow: 'Protected research workspace',
    title: 'Topic Universe',
    description: 'A private orbit of focused weekly questions, evidence paths, and concrete outputs.',
    back: 'Back to public Reading',
    privateNotice: 'Private · no browser persistence',
  },
  state: {
    loading: 'Loading the topic universe…',
    authTitle: 'Authentication is required',
    authMessage: 'Reload this page and complete the protected sign-in prompt.',
    malformedTitle: 'Weekly topic data could not be verified',
    malformedMessage: 'The private data does not match the weekly topic contract.',
    unavailableTitle: 'The topic universe is temporarily unavailable',
    unavailableMessage: 'The protected data service could not be reached.',
    retry: 'Retry',
  },
  universe: {
    heading: 'Research orbit',
    label: 'Weekly topic universe',
    openTopic: (title) => `Open topic: ${title}`,
    pauseMotion: 'Pause topic motion',
    resumeMotion: 'Resume topic motion',
    phase: { current: 'This week', candidate: 'Candidate orbit', archive: 'Archive' },
  },
  detail: {
    question: 'Research question',
    whyNow: 'Why this week',
    scope: 'Working boundary',
    weeklyRoute: 'Four-step route',
    references: 'Evidence path',
    openReference: (title, year) => `Open ${title} (${year}) in the public Library`,
    deliverable: 'Weekly output',
    guardrail: 'Claim boundary',
    proposalNotice: 'Assistant-proposed exploration · not a verified research gap or a record of user endorsement.',
  },
};

const zh: WeeklyMessages = {
  app: {
    eyebrow: '受保护的研究工作区',
    title: '课题宇宙',
    description: '把每周聚焦的问题、证据路径与可交付结果组织成一组缓慢运行的研究轨道。',
    back: '返回公开阅读区',
    privateNotice: '私有 · 浏览器不保存内容',
  },
  state: {
    loading: '正在加载课题宇宙…',
    authTitle: '需要身份验证',
    authMessage: '请重新加载页面，并完成受保护的登录提示。',
    malformedTitle: '每周话题数据未通过校验',
    malformedMessage: '私有数据不符合每周话题契约。',
    unavailableTitle: '课题宇宙暂不可用',
    unavailableMessage: '暂时无法连接受保护的数据服务。',
    retry: '重试',
  },
  universe: {
    heading: '研究轨道',
    label: '每周课题宇宙',
    openTopic: (title) => `打开课题：${title}`,
    pauseMotion: '暂停课题动画',
    resumeMotion: '继续课题动画',
    phase: { current: '本周课题', candidate: '候选轨道', archive: '历史轨道' },
  },
  detail: {
    question: '研究问题',
    whyNow: '为何本周切入',
    scope: '工作边界',
    weeklyRoute: '四步路径',
    references: '证据路径',
    openReference: (title, year) => `在公开文献库中打开 ${title}（${year}）`,
    deliverable: '本周产出',
    guardrail: '论断边界',
    proposalNotice: '助手提出的探索建议 · 不代表已经核证的研究空白，也不代表用户认可。',
  },
};

const zhHk: WeeklyMessages = {
  app: {
    eyebrow: '受保護的研究工作區',
    title: '課題宇宙',
    description: '將每週聚焦的問題、證據路徑與可交付成果組成一組緩慢運行的研究軌道。',
    back: '返回公開閱讀區',
    privateNotice: '私人 · 瀏覽器不會儲存內容',
  },
  state: {
    loading: '正在載入課題宇宙…',
    authTitle: '需要身份驗證',
    authMessage: '請重新載入頁面，並完成受保護的登入提示。',
    malformedTitle: '每週話題數據未通過驗證',
    malformedMessage: '私人數據不符合每週話題規格。',
    unavailableTitle: '課題宇宙暫時無法使用',
    unavailableMessage: '暫時無法連接受保護的數據服務。',
    retry: '重試',
  },
  universe: {
    heading: '研究軌道',
    label: '每週課題宇宙',
    openTopic: (title) => `開啟課題：${title}`,
    pauseMotion: '暫停課題動畫',
    resumeMotion: '繼續課題動畫',
    phase: { current: '本週課題', candidate: '候選軌道', archive: '歷史軌道' },
  },
  detail: {
    question: '研究問題',
    whyNow: '為何本週切入',
    scope: '工作邊界',
    weeklyRoute: '四步路徑',
    references: '證據路徑',
    openReference: (title, year) => `在公開文獻庫開啟 ${title}（${year}）`,
    deliverable: '本週成果',
    guardrail: '論斷邊界',
    proposalNotice: '助手提出的探索建議 · 不代表已核證的研究空白，亦不代表用戶認可。',
  },
};

const MESSAGES: Record<WeeklyLocale, WeeklyMessages> = { en, zh, 'zh-hk': zhHk };

export function getWeeklyMessages(locale: string): WeeklyMessages {
  if (locale === 'zh-hk') return MESSAGES['zh-hk'];
  if (locale === 'zh') return MESSAGES.zh;
  return MESSAGES.en;
}
