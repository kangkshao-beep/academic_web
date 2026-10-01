'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Search,
  Play,
  Pause,
  RotateCcw,
  Settings2,
  Download,
  Upload,
  Orbit,
  PanelRightOpen,
  PanelRightClose,
  X,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import { useLocaleStore } from '@/lib/stores/localeStore';
import {
  localized,
  say,
  STATUSES,
  statusLabel,
  STATUS_SYMBOL,
  type Locale,
  type UniverseDataset,
} from '@/lib/reading/universe/model';
import { mergeDataset, validateDataset } from '@/lib/reading/universe/validate';
import { topicTemplate } from '@/lib/reading/universe/demo';
import knowledge from '@/lib/reading/universe/knowledge.json';
import { EVENT_STAGE_TIMES } from '@/lib/reading/universe/collision';
import TopicDetailModal, { Markdown } from './TopicDetailModal';
import KnowledgeBoard from './KnowledgeBoard';
import type { SceneSettings } from './ResearchScene';
import useWorkspace from './useWorkspace';
import './universe.css';
const ResearchScene = dynamic(() => import('./ResearchScene'), {
  ssr: false,
  loading: () => <div className="ru-scene ru-loading">INITIALIZING SPACE…</div>,
});
const DetectorScene = dynamic(() => import('./DetectorScene'), { ssr: false });
function download(data: UniverseDataset) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${data.datasetKind}-${data.datasetId}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function ResearchUniverse() {
  const rawLocale = useLocaleStore((s) => s.locale);
  const locale: Locale = rawLocale === 'zh' || rawLocale === 'zh-hk' ? rawLocale : 'en';
  const l = (en: string, zh: string, hk?: string) => say(locale, en, zh, hk);
  const workspace = useWorkspace();
  const { dataset, mode, loading, error, notice } = workspace;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [eventStage, setEventStage] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [detectorDescriptionOpen, setDetectorDescriptionOpen] = useState(false);
  const detectorDescriptionToggle = useRef<HTMLButtonElement>(null);
  const listToggle = useRef<HTMLButtonElement>(null);
  const [importError, setImportError] = useState('');
  const [pending, setPending] = useState<UniverseDataset | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<SceneSettings>({
    playing: true,
    speed: 1,
    direction: 1,
    mode: 'read',
    quality: 'medium',
    reduced: false,
    background: true,
    detector: true,
    tracks: true,
    rotateDetector: true,
    collisionSpeed: 4,
    detectorSpeed: 1,
    hiddenLayers: [],
    inspectDetector: false,
    eventTime: null,
    reset: 0,
  });
  const patch = (value: Partial<SceneSettings>) => setSettings((old) => ({ ...old, ...value }));
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSettings((old) => ({ ...old, reduced: media.matches }));
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const topic = dataset?.topics.find((t) => t.id === selected);
  const categories = useMemo(
    () =>
      Array.from(new Set(dataset?.topics.map((t) => localized(t, locale).category) ?? [])).sort(),
    [dataset, locale]
  );
  const visible = useMemo(
    () =>
      dataset?.topics.filter((t) => {
        const value = localized(t, locale);
        return (
          (!category || value.category === category) &&
          (!status || t.status === status) &&
          `${value.title} ${value.shortTitle} ${value.summary} ${t.tags.join(' ')}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase())
        );
      }) ?? [],
    [dataset, locale, category, status, query]
  );
  const conflicts =
    pending && dataset?.datasetKind === pending.datasetKind
      ? pending.topics.filter((t) => dataset.topics.some((existing) => existing.id === t.id)).length
      : 0;
  function chooseMode(next: typeof mode) {
    setSelected(null);
    setPending(null);
    setCategory('');
    setStatus('');
    setQuery('');
    workspace.setMode(next);
  }
  async function readImport(f: File | undefined) {
    if (!f) return;
    setImportError('');
    try {
      if (f.size > 8 * 1024 * 1024) throw Error(l('File limit: 8 MB.', '文件上限为 8 MB。'));
      setPending(validateDataset(JSON.parse(await f.text())));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : l('Invalid JSON', 'JSON 无效'));
    }
    if (file.current) file.current.value = '';
  }
  function acceptImport(strategy: 'keep' | 'replace' | 'switch') {
    if (!pending) return;
    try {
      const next =
        strategy === 'switch' || !dataset ? pending : mergeDataset(dataset, pending, strategy);
      if (!workspace.importData(next)) return;
      setPending(null);
      setSelected(null);
      setCategory('');
      setStatus('');
      setQuery('');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    }
  }
  const noticeText =
    notice === 'saved'
      ? l('Saved in this browser.', '已保存在此浏览器。', '已儲存在此瀏覽器。')
      : notice === 'storage-read'
        ? l(
            'Local storage could not be read. Existing records were not overwritten. Export a backup before continuing.',
            '无法读取本地保存记录，尚未覆盖。继续操作前请保留备份。',
            '無法讀取本地記錄，尚未覆寫。請先保留備份。'
          )
        : notice === 'storage-write'
          ? l(
              'Could not save to this browser. Your changes are only in memory; export a backup now.',
              '浏览器保存失败，当前修改仅在内存中，请立即导出备份。',
              '瀏覽器儲存失敗，修改僅在記憶體中，請立即匯出備份。'
            )
          : '';
  return (
    <div className="ru-app" data-testid="weekly-universe-app" data-locale={locale}>
      <header className="ru-header">
        <div>
          <Link href="/reading/" className="ru-back">
            <ArrowLeft size={13} />
            {l('READING / RESEARCH SPACE', '阅读 / 研究空间', '閱讀 / 研究空間')}
          </Link>
          <h1>
            {l('Research Universe', '课题宇宙', '課題宇宙')}
            <span>01 — ∞</span>
          </h1>
          <p>
            {l(
              'A space for questions. A record of progress.',
              '让问题在空间中相遇，让进展留下轨迹。',
              '讓問題在空間中相遇，讓進展留下軌跡。'
            )}
          </p>
        </div>
        <div className="ru-header-right">
          <div className="ru-source">
            <Orbit size={13} />
            <select
              aria-label={l('Data source', '数据来源', '資料來源')}
              value={mode}
              onChange={(e) => chooseMode(e.target.value as typeof mode)}
            >
              <option value="demo">
                DEMO / {l('Toy model topics', 'Toy model 课题', 'Toy model 課題')}
              </option>
              <option value="imported">
                {l('Imported workspace', '已导入的工作区', '已匯入的工作區')}
              </option>
            </select>
          </div>
          <figure className="ru-header-quote" lang="en">
            <blockquote>
              <p>If you are doing everything well, you are not doing enough good.</p>
            </blockquote>
            <figcaption>— Howard Georgi</figcaption>
          </figure>
        </div>
      </header>
      <div className="ru-dataset-line">
        <span
          className={mode === 'demo' || dataset?.datasetKind === 'demo' ? 'ru-demo' : 'ru-private'}
        >
          {mode === 'demo' || dataset?.datasetKind === 'demo' ? 'DEMO' : l('LOCAL', '本地', '本地')}
        </span>
        <span>
          {mode === 'demo' || dataset?.datasetKind === 'demo'
            ? l(
                'Toy model topics & example statuses. Not your research record.',
                'Toy model 课题与示例状态，不代表你的真实研究记录。',
                'Toy model 課題與示例狀態，並非真實研究記錄。'
              )
            : l(
                'Imported data and progress stay in this browser. Export a backup to keep a copy.',
                '导入数据与进度仅保存在此浏览器，可导出备份留存。',
                '匯入資料與進度僅儲存在此瀏覽器，可匯出備份留存。'
              )}
        </span>
        <span className="ru-save-notice" role="status">
          {noticeText}
        </span>
      </div>
      <section
        className="ru-workspace"
        aria-label={l('Research workspace', '研究工作区', '研究工作區')}
      >
        <div className="ru-toolbar">
          <label className="ru-search">
            <Search size={16} />
            <input
              aria-label={l('Search topics', '搜索课题', '搜尋課題')}
              placeholder={l('Find a question…', '寻找一个问题…', '尋找一個問題…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                aria-label={l('Clear search', '清空搜索', '清空搜尋')}
                onClick={() => setQuery('')}
              >
                <X size={14} />
              </button>
            )}
          </label>
          <SlidersHorizontal size={14} className="ru-filter-icon" />
          <select
            aria-label={l('Category filter', '分类筛选', '分類篩選')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{l('All categories', '全部分类', '全部分類')}</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label={l('Status filter', '状态筛选', '狀態篩選')}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{l('All statuses', '全部状态', '全部狀態')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s, locale)}
              </option>
            ))}
          </select>
          <div className="ru-toolbar-actions">
            <button
              className="ru-icon"
              data-testid="weekly-motion-toggle"
              aria-label={
                settings.playing
                  ? l('Pause rotation', '暂停旋转', '暫停旋轉')
                  : l('Resume rotation', '继续旋转', '繼續旋轉')
              }
              aria-pressed={!settings.playing}
              onClick={() => patch({ playing: !settings.playing })}
            >
              {settings.playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              className="ru-icon"
              aria-label="Reset View"
              onClick={() => patch({ reset: settings.reset + 1, inspectDetector: false })}
            >
              <RotateCcw size={16} />
            </button>
            <details className="ru-settings">
              <summary aria-label={l('Scene settings', '场景设置', '場景設定')}>
                <Settings2 size={17} />
              </summary>
              <div className="ru-settings-panel">
                <h3>{l('Scene controls', '场景控制', '場景控制')}</h3>
                <label>
                  {l('Topic rotation speed', '课题旋转速度', '課題旋轉速度')}
                  <input
                    aria-label={l('Topic rotation speed', '课题旋转速度', '課題旋轉速度')}
                    type="range"
                    min=".2"
                    max="2"
                    step=".1"
                    value={settings.speed}
                    onChange={(e) => patch({ speed: +e.target.value })}
                  />
                  <output>{settings.speed.toFixed(1)}×</output>
                </label>
                <label>
                  {l('Direction', '方向')}
                  <select
                    value={settings.direction}
                    onChange={(e) => patch({ direction: +e.target.value })}
                  >
                    <option value={1}>{l('Forward', '正向')}</option>
                    <option value={-1}>{l('Reverse', '反向')}</option>
                  </select>
                </label>
                <label>
                  {l('Text orientation', '文字姿态', '文字姿態')}
                  <select
                    value={settings.mode}
                    onChange={(e) => patch({ mode: e.target.value as SceneSettings['mode'] })}
                  >
                    <option value="read">{l('Reading', '阅读模式', '閱讀模式')}</option>
                    <option value="exhibit">{l('Exhibition', '展示模式')}</option>
                  </select>
                </label>
                <label>
                  {l('Quality', '画质', '畫質')}
                  <select
                    value={settings.quality}
                    onChange={(e) => patch({ quality: e.target.value as SceneSettings['quality'] })}
                  >
                    {(['low', 'medium', 'high'] as const).map((q, i) => (
                      <option key={q} value={q}>
                        {[l('Low', '低'), l('Medium', '中'), l('High', '高')][i]}
                      </option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    ['reduced', l('Reduce motion', '减少动态', '減少動態')],
                    ['background', l('Knowledge wall', '知识墙', '知識牆')],
                    ['detector', l('Detector', '探测器', '探測器')],
                    ['tracks', l('Track animation', '径迹动画', '徑跡動畫')],
                    ['rotateDetector', l('Rotate detector', '探测器自转', '探測器自轉')],
                  ] as const
                ).map(([key, label]) => (
                  <label className="ru-check" key={key}>
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={(e) => patch({ [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
                <section
                  className="ru-detector-controls"
                  aria-label={l('Detector controls', '探测器控制', '探測器控制')}
                >
                  <h4>{l('Detector & collision', '探测器与对撞', '探測器與對撞')}</h4>
                  <label>
                    {l('Detector rotation speed', '探测器转速', '探測器轉速')}
                    <input
                      aria-label={l('Detector rotation speed', '探测器转速', '探測器轉速')}
                      type="range"
                      min=".25"
                      max="2"
                      step=".25"
                      value={settings.detectorSpeed}
                      onChange={(e) => patch({ detectorSpeed: +e.target.value })}
                    />
                    <output>{settings.detectorSpeed.toFixed(2)}×</output>
                  </label>
                  <label>
                    {l('Collision speed', '对撞速度', '對撞速度')}
                    <input
                      aria-label={l('Collision speed', '对撞速度', '對撞速度')}
                      type="range"
                      min="1"
                      max="6"
                      step=".5"
                      value={settings.collisionSpeed}
                      onChange={(e) => patch({ collisionSpeed: +e.target.value })}
                    />
                    <output>{settings.collisionSpeed.toFixed(1)}×</output>
                  </label>
                  <h5>{l('Event stages', '事例阶段', '事例階段')}</h5>
                  <div
                    className="ru-event-phases"
                    aria-label={l('Collision sequence', '对撞过程', '對撞過程')}
                  >
                    {[
                      l('Beams', '入射'),
                      l('Collision', '对撞', '對撞'),
                      l('D pair', 'D 对', 'D 對'),
                      l('Decays', '次级衰变', '次級衰變'),
                      l('Readout', '末态', '末態'),
                    ].map((label, i) => (
                      <button
                        key={i}
                        data-testid={`event-stage-${i}`}
                        aria-pressed={eventStage === i}
                        onClick={() => patch({ eventTime: EVENT_STAGE_TIMES[i] })}
                      >
                        <small>0{i + 1}</small>
                        {label}
                      </button>
                    ))}
                    <button
                      aria-pressed={settings.eventTime === null && !settings.reduced}
                      onClick={() => patch({ eventTime: null, playing: true, reduced: false })}
                    >
                      {l('Loop', '循环', '循環')} ↻
                    </button>
                  </div>
                  <h5>{l('View & detector layers', '视角与探测器分层', '視角與探測器分層')}</h5>
                  <div className="ru-layers">
                    <button
                      aria-pressed={settings.inspectDetector}
                      onClick={() => patch({ inspectDetector: !settings.inspectDetector })}
                    >
                      {settings.inspectDetector
                        ? l('Back to universe', '返回全景', '返回全景')
                        : l('Inspect detector', '放大探测器', '放大探測器')}
                    </button>
                    {['MDC', 'TOF', 'EMC', 'Solenoid', 'MUC'].map((name, i) => (
                      <button
                        key={name}
                        aria-pressed={!settings.hiddenLayers.includes(i)}
                        onClick={() =>
                          patch({
                            hiddenLayers: settings.hiddenLayers.includes(i)
                              ? settings.hiddenLayers.filter((n) => n !== i)
                              : [...settings.hiddenLayers, i],
                          })
                        }
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <details className="ru-detector-sources">
                    <summary>
                      {l(
                        'Official video & geometry references',
                        '官方视频与结构参考',
                        '官方影片與結構參考'
                      )}
                    </summary>
                    <div>
                      <a
                        href="https://ihep.cas.cn/kxcb/spdh/201510/t20151016_4439808.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        {l(
                          'IHEP video · Science in Focus: BEPC',
                          '高能所收录｜《科学重器·北京正负电子对撞机》',
                          '高能所收錄｜《科學重器·北京正負電子對撞機》'
                        )}{' '}
                        ↗
                      </a>
                      <a
                        href="https://english.ihep.cas.cn/bes/co/pvg/swb/202201/t20220127_300408.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        {l(
                          'BESIII · official detector drawing',
                          'BESIII 官网｜探测器结构图',
                          'BESIII 官網｜探測器結構圖'
                        )}{' '}
                        ↗
                      </a>
                      <a
                        href="https://arxiv.org/abs/2206.10117"
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        {l(
                          'GDML → Unity · detector visualization, figs. 7–9',
                          'GDML → Unity｜探测器可视化，图 7–9',
                          'GDML → Unity｜探測器視覺化，圖 7–9'
                        )}{' '}
                        ↗
                      </a>
                      <a
                        href="https://indico.cern.ch/event/1330797/papers/5796833/files/13914-ACAT2024_Proceeding__Visualizing_BESIII_Events_with_Unity.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                      >
                        BESIII / ACAT 2024 ·{' '}
                        {l(
                          'Collision & event visualization',
                          '对撞与事例可视化',
                          '對撞與事例視覺化'
                        )}{' '}
                        ↗
                      </a>
                      <p>
                        {l(
                          'Reduced-detail reconstruction of the original detector, not official CAD or measured collision data.',
                          '保留原始设计的主要结构，细节经过简化；不是官方 CAD 或实测对撞数据。',
                          '保留原始設計主要結構，細節經過簡化；並非官方 CAD 或實測對撞數據。'
                        )}
                      </p>
                    </div>
                  </details>
                </section>
                <p>
                  {l(
                    'Default sizes are visual hierarchy, not a research priority score.',
                    '默认字号仅用于视觉层次，不表示科研优先级。',
                    '預設字號僅為視覺層次，並非研究優先度。'
                  )}
                </p>
              </div>
            </details>
            <button
              ref={listToggle}
              className="ru-icon ru-list-toggle"
              data-testid="topic-index-toggle"
              aria-label={
                listOpen
                  ? l('Collapse topic index', '收起课题索引', '收起課題索引')
                  : l('Expand topic index', '展开课题索引', '展開課題索引')
              }
              title={
                listOpen
                  ? l('Collapse topic index', '收起课题索引', '收起課題索引')
                  : l('Expand topic index', '展开课题索引', '展開課題索引')
              }
              aria-expanded={listOpen}
              aria-controls="universe-topic-index"
              onClick={() => setListOpen((open) => !open)}
            >
              {listOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
              <span>{l('Topic index', '课题索引', '課題索引')}</span>
            </button>
          </div>
        </div>
        {loading ? (
          <div className="ru-loading">
            <Orbit size={24} />
            {l('Opening your research space…', '正在打开研究空间…', '正在開啟研究空間…')}
          </div>
        ) : error ? (
          <div className="ru-loading" role="alert">
            <h2>{l('No valid imported workspace', '尚无有效导入工作区', '尚無有效匯入工作區')}</h2>
            <p>
              {l(
                'No readable backup was found in this browser. Retry or open the toy model topics.',
                '此浏览器中没有可读取的备份。请重试或打开 Toy model 课题。',
                '此瀏覽器中沒有可讀取的備份。請重試或開啟 Toy model 課題。'
              )}
            </p>
            <div className="ru-actions">
              <button className="ru-button" onClick={workspace.retry}>
                {l('Retry', '重试', '重試')}
              </button>
              <button className="ru-button" onClick={() => chooseMode('demo')}>
                {l('Open DEMO', '打开 DEMO', '開啟 DEMO')}
              </button>
            </div>
          </div>
        ) : (
          <div className="ru-stage">
            <div className="ru-viewport">
              <ResearchScene
                topics={visible}
                locale={locale}
                settings={settings}
                modalOpen={!!topic || !!selectedBoard}
                onSelect={setSelected}
                onBoardSelect={setSelectedBoard}
              />
              <section
                className="ru-detector-dock"
                data-testid="detector-dock"
                data-inspecting={settings.inspectDetector}
                hidden={!settings.detector && !settings.inspectDetector}
                aria-label={l('Independent detector view', '独立探测器视图', '獨立探測器視圖')}
              >
                <div className="ru-detector-view">
                  <DetectorScene
                    settings={settings}
                    locale={locale}
                    modalOpen={!!topic || !!selectedBoard}
                    onEventStage={setEventStage}
                  />
                </div>
                <div
                  className="ru-detector-caption"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && detectorDescriptionOpen) {
                      event.stopPropagation();
                      setDetectorDescriptionOpen(false);
                      detectorDescriptionToggle.current?.focus();
                    }
                  }}
                >
                  <button
                    ref={detectorDescriptionToggle}
                    type="button"
                    className="ru-detector-description-toggle"
                    data-testid="detector-description-toggle"
                    aria-expanded={detectorDescriptionOpen}
                    aria-controls="detector-description"
                    onClick={() => setDetectorDescriptionOpen((open) => !open)}
                  >
                    <span>
                      {l('BESIII · Event notes', 'BESIII · 事例说明', 'BESIII · 事例說明')}
                    </span>
                    <ChevronDown size={12} aria-hidden="true" />
                  </button>
                  <div id="detector-description" hidden={!detectorDescriptionOpen}>
                    <span>
                      {l(
                        'e⁺e⁻ → ψ(3770) → D⁰D̄⁰ · teaching event',
                        'e⁺e⁻ → ψ(3770) → D⁰D̄⁰ · 教学示意',
                        'e⁺e⁻ → ψ(3770) → D⁰D̄⁰ · 教學示意'
                      )}
                    </span>
                    <div className="ru-event-chain">D⁰ → X e⁺ νₑ</div>
                    <span>
                      {l(
                        'X denotes the total hadronic system · D̄⁰ tag muted',
                        'X 表示整个强子系统 · D̄⁰ 标记侧淡化',
                        'X 表示整個強子系統 · D̄⁰ 標記側淡化'
                      )}
                    </span>
                    <small className="ru-event-note">
                      {l(
                        'Straight-flight illustration · D flights enlarged · ν: missing momentum',
                        '直线飞行示意 · D 飞行距离已放大 · ν 为缺失动量',
                        '直線飛行示意 · D 飛行距離已放大 · ν 為缺失動量'
                      )}
                    </small>
                  </div>
                </div>
              </section>
              <div className="ru-scene-caption">
                <span className="ru-dot" />
                {l('HEAVY FLAVOR / SEMANTIC SPACE', '重味物理 / 课题空间', '重味物理 / 課題空間')}
              </div>
              {settings.background && !settings.inspectDetector && (
                <nav className="ru-board-nav" aria-label="Mannel blackboards">
                  <span>MANNEL /</span>
                  {knowledge.map((board, i) => (
                    <button
                      key={board.id}
                      data-testid={`board-${board.id}`}
                      aria-label={`${String(i + 1).padStart(2, '0')} / ${board.title}`}
                      title={board.title}
                      onClick={() => setSelectedBoard(board.id)}
                    >
                      <span>{String(i + 1).padStart(2, '0')}</span>
                    </button>
                  ))}
                </nav>
              )}
              <div className="ru-scene-help">
                {l(
                  'DRAG TO ORBIT · SCROLL TO ZOOM · SELECT TO EXPLORE',
                  '拖动观察 · 滚轮缩放 · 点击探索',
                  '拖曳觀察 · 滾輪縮放 · 點擊探索'
                )}
              </div>
              {settings.inspectDetector && (
                <aside className="ru-event-explainer">
                  <span>TOY EVENT / 0{eventStage + 1} — 05</span>
                  <h3>
                    {
                      [
                        l('Beam approach', '束流入射'),
                        l('Annihilation & resonance', '湮灭与共振产生', '湮滅與共振產生'),
                        l('A neutral D pair', '中性 D 介子对', '中性 D 介子對'),
                        'D⁰ → X e⁺ νₑ',
                        l(
                          'X, positron & missing momentum',
                          'X、正电子与缺失动量',
                          'X、正電子與缺失動量'
                        ),
                      ][eventStage]
                    }
                  </h3>
                  <p>
                    {
                      [
                        l(
                          'Counter-propagating e⁻ and e⁺ bunches approach the interaction point along the beam axis.',
                          '电子与正电子束团沿束流轴相向运动，在探测器中心相遇。'
                        ),
                        l(
                          'e⁺e⁻ annihilate through the electromagnetic current. The illustrated channel is ψ(3770) → D⁰D̄⁰.',
                          '正负电子通过电磁流湮灭。这里选择 ψ(3770) → D⁰D̄⁰ 通道演示。'
                        ),
                        l(
                          'The two neutral mesons fly in opposite directions in the centre-of-mass frame. Their flights are enlarged here.',
                          '质心系中两个中性 D 介子反向飞行，不被磁场弯曲。此处放大飞行距离以区分两个衰变顶点。'
                        ),
                        l(
                          'At the D⁰ vertex, one cyan X direction represents the total hadronic momentum, alongside one gold positron. The dashed νₑ line indicates missing momentum.',
                          'D⁰ 顶点展开为一条青色 X 合动量方向和一条金色正电子径迹；νₑ 虚线表示缺失动量。',
                          'D⁰ 頂點展開為一條青色 X 合動量方向和一條金色正電子徑跡；νₑ 虛線表示缺失動量。'
                        ),
                        l(
                          'X, e⁺ and νₑ share one decay vertex. X represents the combined hadronic system without specifying its constituents. Their four-momenta sum to the parent D⁰.',
                          'X、e⁺ 和 νₑ 来自同一个衰变顶点。X 代表强子系统，不指定内部粒子；三部分四动量之和等于母粒子 D⁰ 的四动量。',
                          'X、e⁺ 和 νₑ 來自同一個衰變頂點。X 代表強子系統，不指定內部粒子；三部分四動量之和等於母粒子 D⁰ 的四動量。'
                        ),
                      ][eventStage]
                    }
                  </p>
                </aside>
              )}
              {!visible.length && (
                <div className="ru-empty">
                  {l(
                    'No topics match. Clear your filters to explore again.',
                    '没有匹配的课题，请调整搜索或筛选。',
                    '沒有符合的課題，請調整搜尋或篩選。'
                  )}
                </div>
              )}
            </div>
            <aside
              id="universe-topic-index"
              data-testid="topic-index"
              className="ru-topic-rail"
              hidden={!listOpen}
              aria-labelledby="research-topic-index-heading"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setListOpen(false);
                  listToggle.current?.focus();
                }
              }}
            >
              <header>
                <span id="research-topic-index-heading">
                  {l('TOPIC INDEX', '课题索引', '課題索引')}
                </span>
                <span>
                  {visible.length} / {dataset?.topics.length}
                </span>
              </header>
              <div className="ru-topic-list">
                {visible.map((t, i) => (
                  <button
                    key={t.id}
                    data-testid={`weekly-topic-${t.id}`}
                    onClick={() => setSelected(t.id)}
                  >
                    <span className="ru-topic-number">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      <strong>{localized(t, locale).shortTitle}</strong>
                      <small>{localized(t, locale).category}</small>
                    </span>
                    <span
                      className={`ru-status-symbol ru-status-${t.status}`}
                      aria-label={statusLabel(t.status, locale)}
                    >
                      {STATUS_SYMBOL[t.status]}
                    </span>
                  </button>
                ))}
              </div>
              <footer>
                {visible.length > 60
                  ? l(
                      'First 60 in space; all results in this list.',
                      '空间显示前 60 项，列表保留全部结果。',
                      '空間顯示前 60 項，列表保留全部結果。'
                    )
                  : l(
                      'Every question has a place.',
                      '每个问题，都有自己的位置。',
                      '每個問題，都有自己的位置。'
                    )}
              </footer>
            </aside>
          </div>
        )}
        <div className="ru-statusbar">
          <div className="ru-legend">
            {STATUSES.map((s) => (
              <span key={s} className={`ru-status-${s}`}>
                {STATUS_SYMBOL[s]} {statusLabel(s, locale)}
              </span>
            ))}
          </div>
          <span>
            {settings.reduced
              ? l('Reduced motion', '已减少动态', '已減少動態')
              : !settings.playing
                ? l('Rotation paused', '旋转已暂停', '旋轉已暫停')
                : l('Hover to hold a question', '悬停以稳定课题', '懸停以穩定課題')}
          </span>
        </div>
      </section>
      <div className="ru-bottom">
        <div>
          <h2>
            {l('Your research, kept close.', '研究留在你的掌握之中。', '研究留在你的掌握之中。')}
          </h2>
          <p>
            {l(
              'Status and notes are saved only in this browser. No cross-device sync. Clearing site data removes local changes; export a backup regularly.',
              '进度与笔记仅保存在此浏览器，不跨设备同步。清除网站数据会丢失本地修改，请定期导出备份。',
              '進度與筆記僅儲存在此瀏覽器，不跨裝置同步。清除網站資料會遺失本地修改，請定期匯出備份。'
            )}
          </p>
        </div>
        <div className="ru-actions">
          <button className="ru-button" onClick={() => file.current?.click()}>
            <Upload size={15} />
            {l('Import JSON', '导入 JSON', '匯入 JSON')}
          </button>
          <input
            hidden
            ref={file}
            type="file"
            accept="application/json,.json"
            data-testid="universe-import"
            onChange={(e) => void readImport(e.target.files?.[0])}
          />
          <button
            className="ru-button"
            disabled={!dataset}
            onClick={() => dataset && download(dataset)}
          >
            <Download size={15} />
            {l('Export backup', '导出备份', '匯出備份')}
          </button>
          <button className="ru-text-button" onClick={() => download(topicTemplate)}>
            {l('Topic template', '课题模板', '課題範本')}
            <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
      {importError && (
        <p role="alert" className="ru-import-error">
          {importError}
        </p>
      )}
      {pending && (
        <section
          className="ru-import-review"
          aria-label={l('Review import', '确认导入', '確認匯入')}
        >
          <h3>
            {l('Review import', '确认导入', '確認匯入')} ·{' '}
            {pending.datasetKind === 'demo'
              ? 'DEMO'
              : l('LOCAL WORKSPACE', '本地工作区', '本地工作區')}
          </h3>
          <p>
            {pending.topics.length} {l('topics', '条课题', '項課題')} · {conflicts}{' '}
            {l(
              'duplicate IDs. Choose how to handle existing content.',
              '个重复 ID，请选择如何处理已有内容。',
              '個重複 ID，請選擇如何處理已有內容。'
            )}
          </p>
          <div className="ru-actions">
            {dataset?.datasetKind === pending.datasetKind && (
              <>
                <button className="ru-button" onClick={() => acceptImport('keep')}>
                  {l('Merge · keep existing', '合并 · 保留已有', '合併 · 保留現有')}
                </button>
                <button className="ru-button" onClick={() => acceptImport('replace')}>
                  {l(
                    'Merge · use imported duplicates',
                    '合并 · 用导入内容替换重复项',
                    '合併 · 以匯入內容取代重複項'
                  )}
                </button>
              </>
            )}
            <button className="ru-button" onClick={() => acceptImport('switch')}>
              {l('Open as separate workspace', '作为独立工作区打开', '作為獨立工作區開啟')}
            </button>
            <button className="ru-text-button" onClick={() => setPending(null)}>
              {l('Cancel', '取消')}
            </button>
          </div>
          <small>
            {l(
              'Import stores the chosen dataset locally. Export the current workspace first if you need a backup.',
              '导入会在浏览器保存所选数据集。若需保留当前工作区，请先导出备份。',
              '匯入會在瀏覽器儲存所選資料集，請先備份目前工作區。'
            )}
          </small>
        </section>
      )}
      {selectedBoard && (
        <KnowledgeBoard
          id={selectedBoard}
          locale={locale}
          onClose={() => setSelectedBoard(null)}
          onSelect={setSelectedBoard}
        />
      )}
      <details className="ru-knowledge-notes">
        <summary>Field notes / Physics &amp; sources</summary>
        <p>Knowledge panels and the decay axis are context, never completed tasks.</p>
        <div className="ru-knowledge-grid">
          {knowledge.map((panel) => (
            <article key={panel.id}>
              <h3>{panel.title}</h3>
              <Markdown>{`$$${panel.latex}$$`}</Markdown>
              <p>{panel.note}</p>
              <button className="ru-board-link" onClick={() => setSelectedBoard(panel.id)}>
                Mannel · § {panel.section} · pp. {panel.pages} ↗
              </button>
            </article>
          ))}
        </div>
        <p>
          BESIII cutaway follows the official drawing and published GDML/Unity visualizations:
          octagonal return yoke, segmented calorimeter, barrel counters and endcaps. Geometry is
          simplified and represents the original design, not the latest upgrades. The e⁺e⁻ → ψ(3770)
          → D⁰D̄⁰ sequence is a teaching event with conserved vertex four-momenta and exaggerated
          timing/vertices. The signal is D⁰ → X e⁺νₑ. X is displayed as the total hadronic momentum,
          without specifying individual hadrons. In the inclusive rate, X is summed over all allowed
          hadronic final states; this schematic illustrates kinematics, not that rate.{' '}
          <a
            href="https://arxiv.org/abs/0911.4960"
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            BESIII design paper ↗
          </a>
        </p>
      </details>
      {topic && (
        <TopicDetailModal
          key={topic.id}
          topic={topic}
          locale={locale}
          onClose={() => setSelected(null)}
          onUpdate={(s, n) => workspace.update(topic.id, s, n)}
        />
      )}
    </div>
  );
}
