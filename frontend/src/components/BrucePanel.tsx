import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Sparkles, Send, X, RotateCcw, History, Info } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useBruceAnswers, type Answer } from '../modules/bruce/useBruceAnswers';
import { Chart } from './Chart';

interface Turn { q: string; answer: Answer | null }

/**
 * Bruce AI as a floating assistant over any screen, rather than a separate destination.
 * Each reply carries the chart it was derived from, so the evidence travels with the claim.
 */
export function BrucePanel() {
  const { bruceOpen, setBruceOpen } = useStore();
  const answers = useBruceAnswers();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [typed, setTyped] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bruceOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBruceOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bruceOpen, setBruceOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  if (!bruceOpen) return null;

  const ask = (q: string) => {
    const needle = q.toLowerCase().trim();
    if (!needle) return;
    const hit = answers.find((x) => x.question.toLowerCase().includes(needle))
      ?? answers.find((x) => needle.split(/\s+/).some((w) => w.length > 3 && x.question.toLowerCase().includes(w)))
      ?? answers.find((x) => needle.split(/\s+/).some((w) => w.length > 3 && (x.headline + x.body.join(' ')).toLowerCase().includes(w)))
      ?? null;
    setTurns((t) => [...t, { q, answer: hit }]);
    setTyped('');
  };

  return (
    <div className="fc-fade fixed inset-0 z-50 flex items-center justify-end bg-ink/25 p-4" role="dialog" aria-modal aria-label="Bruce AI">
      <button type="button" aria-label="Close Bruce" className="absolute inset-0" onClick={() => setBruceOpen(false)} />

      <aside className="fc-drawer-in relative flex h-full w-full max-w-[720px] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-drawer">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="grid h-8 w-8 place-items-center rounded-ctl bg-gradient-to-br from-[#6E56CF] to-[#1655F2]">
            <Sparkles size={15} className="text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="card-title">Bruce AI</h2>
            <p className="text-2xs text-txt-muted">Answers computed from the live demo dataset</p>
          </div>
          <button type="button" onClick={() => setTurns([])} title="Clear conversation" className="rounded p-1.5 text-txt-muted hover:bg-subtle">
            <RotateCcw size={14} />
          </button>
          <button type="button" title="History (demo)" className="rounded p-1.5 text-txt-muted hover:bg-subtle">
            <History size={14} />
          </button>
          <button type="button" onClick={() => setBruceOpen(false)} aria-label="Close" className="rounded p-1.5 text-danger hover:bg-subtle">
            <X size={15} />
          </button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div className="rounded-ctl border-l-2 border-[#6E56CF] bg-subtle px-3 py-2.5">
            <p className="text-sm text-txt-secondary">
              Ask about downtime, yield, shift performance or quality loss &mdash; each reply shows the chart it came from.
            </p>
            <p className="mt-1 text-2xs text-txt-muted">
              Future phase. OBX asked for trusted, contextualised data first; Bruce runs on the foundation, it is not the starting point.
            </p>
          </div>

          {turns.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {answers.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => ask(a.question)}
                  className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-txt-secondary hover:border-azure-200 hover:bg-azure-50"
                >
                  {a.question}
                </button>
              ))}
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className="fc-rise space-y-2">
              <div className="flex justify-end">
                <p className="max-w-[80%] rounded-card rounded-br-sm bg-azure-600 px-3 py-2 text-xs text-white">{t.q}</p>
              </div>

              {t.answer ? (
                <div className="rounded-card border border-line bg-canvas p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-txt-primary">{t.answer.headline}</p>
                    <span
                      className={clsx(
                        'shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold',
                        t.answer.confidence === 'High' ? 'bg-[rgba(30,158,90,.14)] text-ok'
                          : t.answer.confidence === 'Medium' ? 'bg-warn-bg text-warn'
                            : 'bg-subtle text-txt-secondary',
                      )}
                    >
                      {t.answer.confidence}
                    </span>
                  </div>

                  {t.answer.body.map((p) => (
                    <p key={p} className="mb-1.5 text-xs leading-relaxed text-txt-secondary">{p}</p>
                  ))}

                  <div className="mt-2 rounded-ctl border border-line bg-surface">
                    <div className="border-b border-line px-3 py-1.5">
                      <p className="text-xs font-semibold text-txt-primary">{t.answer.chartTitle}</p>
                      <p className="text-2xs text-txt-muted">{t.answer.chartSubtitle}</p>
                    </div>
                    <Chart options={t.answer.chart} height={240} className="px-1 pb-1" />
                  </div>

                  <div className="mt-2 flex items-start gap-1.5 rounded-ctl border border-azure-200 bg-azure-50 px-2.5 py-1.5">
                    <Info size={12} className="mt-0.5 shrink-0 text-azure-600" />
                    <p className="text-2xs text-txt-primary"><b>Next step:</b> {t.answer.nextStep}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-card border border-line bg-canvas p-3">
                  <p className="text-xs text-txt-secondary">
                    I can&rsquo;t answer that from the demo dataset. In the demo I cover shift performance on WFE-2M,
                    where downtime hours go, whether WFE conditions explain yield, what quality loss costs, and the
                    plant OEE trend.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {answers.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => ask(a.question)}
                        className="rounded-full border border-line px-2.5 py-1 text-2xs text-txt-secondary hover:bg-subtle"
                      >
                        {a.question}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <footer className="border-t border-line p-3">
          <div className="flex items-end gap-2 rounded-card border border-line bg-subtle p-2">
            <textarea
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(typed); }
              }}
              rows={2}
              placeholder="Ask Bruce"
              aria-label="Ask Bruce"
              className="min-h-[38px] flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-txt-muted"
            />
            <button
              type="button"
              onClick={() => ask(typed)}
              disabled={!typed.trim()}
              aria-label="Send"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6E56CF] to-[#1655F2] text-white disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </div>
          <p className="mt-1.5 px-1 text-2xs text-txt-muted">
            Demo responses are pre-computed from the seeded dataset &mdash; Bruce is not calling a model here.
          </p>
        </footer>
      </aside>
    </div>
  );
}
