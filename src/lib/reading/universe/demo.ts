import type { UniverseDataset } from './model';

const entries = [
  ['endpoint', 'Endpoint Smearing', '端点涂抹', '端點塗抹', 'Endpoint'],
  ['shape', 'Shape Function', '形状函数', '形狀函數', 'Endpoint'],
  ['duality', 'Duality Window', '对偶窗口', '對偶窗口', 'HQE'],
  ['rpi', 'RPI Check', 'RPI 检查', 'RPI 檢查', 'HQE'],
  ['mass', '1S Mass Scheme', '1S 质量方案', '1S 質量方案', 'Matching'],
  ['moments', 'Lepton Moments', '轻子能量矩', '輕子能量矩', 'Observables'],
  ['lepton', 'Finite Lepton Mass', '有限轻子质量', '有限輕子質量', 'Observables'],
  ['lfu', 'LFU Ratios', 'LFU 比值', 'LFU 比值', 'Observables'],
  ['two-quark', 'Two-quark Matching', '双夸克匹配', '雙夸克匹配', 'Matching'],
  ['four-quark', 'Four-quark Basis', '四夸克基底', '四夸克基底', 'Matching'],
];
export const demoDataset: UniverseDataset = {
  schemaVersion: 1,
  datasetId: 'demo-universe',
  datasetKind: 'demo',
  topics: entries.map(([id, en, zh, hk, category], i) => {
    const enContent = {
      shortTitle: en,
      title: `DEMO — ${en}: a bounded study`,
      category,
      summary:
        'A toy model for exploring this interface. It is not a real research assignment or result.',
      motivation:
        'Compare a baseline with one controlled change, keeping the assumptions explicit.',
      startingPoint:
        'The research theme is $D \\to X e^+ \\nu_e$. Here $X$ denotes the inclusive sum over allowed hadronic states.',
      workPlan:
        '1. State the question and conventions.\n2. Isolate a reproducible calculation.\n3. Perform an independent check.\n4. Record the outcome and remaining limitations.',
      checks: 'Illustrative checklist only; no calculation has been performed.',
    };
    return {
      ...enContent,
      id: `demo-${id}`,
      tags: [category, 'DEMO'],
      status: i === 1 || i === 7 ? 'completed' : i % 5 === 0 ? 'in_progress' : 'unknown',
      date: null,
      completedAt: null,
      references: [],
      artifacts: [],
      relatedTopicIds: [],
      source: 'Synthetic interface fixture',
      isDemo: true,
      locales: {
        en: enContent,
        zh: {
          ...enContent,
          shortTitle: zh,
          title: `DEMO — ${zh}：限定范围的研究示例`,
          summary: '用于演示界面的 toy model，不代表你的真实研究安排或成果。',
          motivation: '围绕一个明确问题比较基准与单一变化，记录假设及适用条件。',
          startingPoint: '研究主线为 $D \\to X e^+ \\nu_e$，其中 $X$ 是允许强子末态的单举求和。',
          workPlan:
            '1. 明确问题与记号。\n2. 整理可重复的计算步骤。\n3. 做独立检查。\n4. 记录结果与限制。',
          checks: '仅为演示清单，尚未执行任何研究计算。',
        },
        'zh-hk': {
          ...enContent,
          shortTitle: hk,
          title: `DEMO — ${hk}：限定範圍的研究示例`,
          summary: '用於演示介面的 toy model，不代表你的真實研究安排或成果。',
          motivation: '圍繞明確問題比較基準與單一變化，記錄假設與適用條件。',
          startingPoint: '研究主線為 $D \\to X e^+ \\nu_e$，$X$ 表示允許強子末態的單舉求和。',
          workPlan: '1. 明確問題與記號。\n2. 整理計算步驟。\n3. 做獨立檢查。\n4. 記錄結果與限制。',
          checks: '僅為演示清單，尚未執行研究計算。',
        },
      },
    };
  }),
};
export const topicTemplate: UniverseDataset = {
  schemaVersion: 1,
  datasetId: 'my-weekly-topics',
  datasetKind: 'private',
  topics: [
    {
      id: 'my-topic-001',
      shortTitle: '填写短标题',
      title: '填写具体研究问题',
      category: '未分类',
      tags: [],
      status: 'unknown',
      date: null,
      summary: '',
      motivation: '',
      startingPoint: '',
      workPlan: '',
      checks: '',
      results: '',
      openQuestions: '',
      nextSteps: '',
      notesMarkdown: '',
      references: [],
      artifacts: [],
      relatedTopicIds: [],
      completedAt: null,
      source: 'User import',
      isDemo: false,
    },
  ],
};
