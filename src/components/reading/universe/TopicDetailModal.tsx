'use client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, Check, ArrowUpRight, Save } from 'lucide-react';
import {
  localized,
  say,
  STATUSES,
  statusLabel,
  STATUS_SYMBOL,
  type ResearchTopic,
  type TopicStatus,
  type Locale,
} from '@/lib/reading/universe/model';
import { safeUrl } from '@/lib/reading/universe/validate';
import 'katex/dist/katex.min.css';

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[
        [rehypeKatex, { trust: false, strict: 'ignore', maxExpand: 500, maxSize: 15 }],
      ]}
      urlTransform={(url) => safeUrl(url) ?? ''}
      components={{
        img: () => <span>[image omitted]</span>,
        a: ({ href, children }) =>
          href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
              {children} ↗
            </a>
          ) : (
            <span>{children}</span>
          ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
interface Props {
  topic: ResearchTopic;
  locale: Locale;
  onClose: () => void;
  onUpdate: (status: TopicStatus, notes: string) => void;
}
export default function TopicDetailModal({ topic, locale, onClose, onUpdate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [tab, setTab] = useState('overview');
  const [notes, setNotes] = useState(topic.notesMarkdown ?? '');
  const t = localized(topic, locale);
  const l = (en: string, zh: string, hk?: string) => say(locale, en, zh, hk);
  useEffect(() => {
    const element = dialog.current!;
    const active = document.activeElement as HTMLElement | null;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      element.close();
      if (active?.isConnected) active.focus({ preventScroll: true });
    };
  }, []);
  const field = (label: string, value?: string) => (
    <section className="ru-detail-section">
      <h3>{label}</h3>
      <div className="ru-prose">
        {value ? (
          <Markdown>{value}</Markdown>
        ) : (
          <p className="ru-muted">{l('Not recorded yet.', '尚未记录。', '尚未記錄。')}</p>
        )}
      </div>
    </section>
  );
  const tabs = [
    ['overview', l('Overview', '概览', '概覽')],
    ['work', l('Work & checks', '计算与检查', '計算與檢查')],
    ['references', l('References', '文献与成果', '文獻與成果')],
    ['progress', l('Progress & notes', '进度与笔记', '進度與筆記')],
  ];
  return (
    <dialog
      ref={dialog}
      className="ru-dialog"
      data-testid="topic-modal"
      aria-labelledby="ru-modal-title"
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const r = dialog.current.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            close.current();
        }
      }}
    >
      <div className="ru-dialog-head">
        <span className="ru-eyebrow">
          {topic.isDemo ? 'DEMO / ' : ''}
          {t.category}
        </span>
        <button
          className="ru-icon"
          autoFocus
          aria-label={l('Close details', '关闭详情', '關閉詳情')}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="ru-dialog-title">
        <h2 id="ru-modal-title">{t.shortTitle}</h2>
        <p>{t.title}</p>
        <span className={`ru-status ru-status-${topic.status}`}>
          {STATUS_SYMBOL[topic.status]} {statusLabel(topic.status, locale)}
        </span>
        {topic.date && <time>{topic.date}</time>}
      </div>
      <div
        className="ru-tabs"
        role="tablist"
        aria-label={l('Topic sections', '课题内容', '課題內容')}
      >
        {tabs.map(([key, title], index) => (
          <button
            key={key}
            id={`ru-tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls="ru-tab-panel"
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const next = (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4;
                setTab(tabs[next][0]);
                document.getElementById(`ru-tab-${tabs[next][0]}`)?.focus();
              }
            }}
          >
            {title}
          </button>
        ))}
      </div>
      <div
        className="ru-dialog-scroll"
        id="ru-tab-panel"
        role="tabpanel"
        aria-labelledby={`ru-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'overview' && (
          <>
            {field(l('Research question', '研究问题', '研究問題'), t.summary)}
            {field(l('Why this question', '研究动机', '研究動機'), t.motivation)}
            {field(l('Starting point & scope', '起点与范围', '起點與範圍'), t.startingPoint)}
            {field(l('Current results', '已有结果', '已有結果'), t.results)}
            {field(l('Open questions', '未解决问题', '未解決問題'), t.openQuestions)}
          </>
        )}
        {tab === 'work' && (
          <>
            {field(l('Calculation route', '计算步骤', '計算步驟'), t.workPlan)}
            {field(l('Independent checks & limits', '独立检查与限制', '獨立檢查與限制'), t.checks)}
            {field(
              l('Next steps / intended output', '下一步／预期产出', '下一步／預期產出'),
              t.nextSteps
            )}
          </>
        )}
        {tab === 'references' && (
          <>
            {[
              ['references', l('References', '参考文献', '參考文獻')],
              ['artifacts', l('Research artifacts', '成果链接', '成果連結')],
            ].map(([key, label]) => (
              <section className="ru-detail-section" key={key}>
                <h3>{label}</h3>
                {topic[key as 'references' | 'artifacts'].length ? (
                  topic[key as 'references' | 'artifacts'].map((link) => (
                    <a
                      className="ru-reference"
                      key={link.id}
                      href={safeUrl(link.url) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                    >
                      {link.title}
                      <ArrowUpRight size={15} />
                    </a>
                  ))
                ) : (
                  <p className="ru-muted">{l('Not recorded yet.', '尚未记录。', '尚未記錄。')}</p>
                )}
              </section>
            ))}
            {field(l('Record source', '记录来源', '記錄來源'), topic.source)}
          </>
        )}
        {tab === 'progress' && (
          <>
            <section className="ru-detail-section">
              <h3>{l('Research status', '研究状态', '研究狀態')}</h3>
              <p className="ru-muted">
                {l(
                  'Completion applies only to this bounded topic, not the entire research field.',
                  '完成仅指本课题限定的具体工作，不代表完成整个研究领域。',
                  '完成僅指本課題限定的工作。'
                )}
              </p>
              <label className="ru-control-label">
                {l('Status', '状态', '狀態')}
                <select
                  aria-label={l('Topic status', '课题状态', '課題狀態')}
                  value={topic.status}
                  onChange={(e) => onUpdate(e.target.value as TopicStatus, notes)}
                >
                  {STATUSES.map((s) => (
                    <option value={s} key={s}>
                      {statusLabel(s, locale)}
                    </option>
                  ))}
                </select>
              </label>
              {topic.completedAt && (
                <p>
                  {l('Completed at', '完成时间', '完成時間')}：
                  <time>{new Date(topic.completedAt).toLocaleString(locale)}</time>
                </p>
              )}
            </section>
            <section className="ru-detail-section">
              <h3>{l('Private notes', '私人笔记', '私人筆記')}</h3>
              <textarea
                aria-label={l('Private notes', '私人笔记', '私人筆記')}
                value={notes}
                maxLength={20000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={l(
                  'Markdown and $LaTeX$ supported.',
                  '支持 Markdown 与 $LaTeX$。',
                  '支援 Markdown 與 $LaTeX$。'
                )}
                rows={7}
              />
              <button className="ru-button" onClick={() => onUpdate(topic.status, notes)}>
                <Save size={15} />
                {l('Save notes', '保存笔记', '儲存筆記')}
              </button>
              {notes && (
                <div className="ru-prose ru-note-preview">
                  <Markdown>{notes}</Markdown>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <footer className="ru-dialog-footer">
        <span>
          {l(
            'Saved in this browser · export a backup',
            '保存在此浏览器 · 请导出备份',
            '儲存在此瀏覽器 · 請匯出備份'
          )}
        </span>
        <button
          className="ru-button ru-primary"
          data-testid="topic-complete"
          onClick={() =>
            onUpdate(topic.status === 'completed' ? 'in_progress' : 'completed', notes)
          }
        >
          <Check size={16} />
          {topic.status === 'completed'
            ? l('Reopen topic', '重新打开课题', '重新開啟課題')
            : l('Mark complete', '标记完成', '標記完成')}
        </button>
      </footer>
    </dialog>
  );
}
