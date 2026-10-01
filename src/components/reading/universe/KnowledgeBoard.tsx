'use client';
import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import boards from '@/lib/reading/universe/knowledge.json';
import type { Locale } from '@/lib/reading/universe/model';
import { Markdown } from './TopicDetailModal';
export default function KnowledgeBoard({
  id,
  onClose,
  onSelect,
}: {
  id: string;
  locale: Locale;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const index = boards.findIndex((b) => b.id === id),
    board = boards[index];
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const active = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (active?.isConnected) active.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    scroll.current?.scrollTo(0, 0);
  }, [id]);
  return (
    <dialog
      ref={dialog}
      className="ru-blackboard"
      lang="en"
      data-testid="knowledge-modal"
      aria-labelledby="ru-board-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) {
          const r = dialog.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header className="ru-board-header">
        <div>
          <span className="ru-board-kicker">MANNEL / HEAVY QUARK LECTURES</span>
          <h2 id="ru-board-title">
            <span>{String(index + 1).padStart(2, '0')}</span>
            {board.title}
          </h2>
        </div>
        <button autoFocus className="ru-icon" aria-label="Close blackboard" onClick={onClose}>
          <X size={22} />
        </button>
      </header>
      <div ref={scroll} className="ru-board-scroll" key={id}>
        <p className="ru-board-goal">{board.goal}</p>
        <div className="ru-board-result">
          <span>Key result</span>
          <Markdown>{board.result}</Markdown>
        </div>
        <div className="ru-board-steps">
          {board.steps.map((step, i) => (
            <section key={step.title}>
              <div className="ru-board-number">{String(i + 1).padStart(2, '0')}</div>
              <div className="ru-prose">
                <h3>{step.title}</h3>
                <Markdown>{step.body}</Markdown>
              </div>
            </section>
          ))}
        </div>
        <details className="ru-board-check">
          <summary>Check your understanding · {board.check}</summary>
          <p>{board.answer}</p>
        </details>
        <aside className="ru-board-source">
          <strong>Lecture reference</strong>
          <p>
            Thomas Mannel · Effective Field Theories for Heavy Quarks: Heavy Quark Effective Theory
            and Heavy Quark Expansion
          </p>
          <p>
            User-provided Lecture-Mannel.pdf · § {board.section} · printed pages {board.pages} (PDF
            pages {board.pdfPages}) · equations {board.equations}.
          </p>
          <p>
            Teaching derivations follow the lectures. Completing the square, intermediate algebra,
            and connections to D decays are supplied as additional explanations. We use natural
            units, g = (+, −, −, −), Dμ = ∂μ + igₛAμ, and δm = 0.
          </p>
        </aside>
      </div>
      <footer className="ru-board-footer">
        <button disabled={index === 0} onClick={() => onSelect(boards[index - 1].id)}>
          <ArrowLeft size={14} />
          Previous
        </button>
        <span>
          Click outside or press Esc to return · {index + 1} / {boards.length}
        </span>
        <button
          disabled={index === boards.length - 1}
          onClick={() => onSelect(boards[index + 1].id)}
        >
          Next
          <ArrowRight size={14} />
        </button>
      </footer>
    </dialog>
  );
}
