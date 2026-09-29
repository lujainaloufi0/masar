'use client';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { canCreateTask, type AssistantReply, type AssistantTurn, type TaskDraft } from '@masar/shared';
import { api, errorKey } from '@/lib/api';
import { useLookup, useTasks } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { fmtDate } from '@/lib/format';
import { Icon } from './Icon';
import { useDrawer } from './drawer-ctx';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  taskIds?: string[];
  draft?: TaskDraft | null;
  error?: boolean;
}

/**
 * "Ask Masar": questions about your tasks, answered by an AI model that can only
 * read what you can already see. It never changes anything; a drafted task opens
 * in the normal task form for the person to review and create.
 */
export function Assistant() {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  const { data: tasks } = useTasks();
  const { drawer, open: openDrawer } = useDrawer();
  const { data: status } = useQuery({
    queryKey: ['assistant-status'],
    queryFn: () => api<{ enabled: boolean }>('/assistant/status'),
    staleTime: Infinity,
  });
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !drawer) {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, drawer]);

  if (!status?.enabled || !L.me) return null;
  const me = L.me;
  const heads = canCreateTask(me, me.deptId);
  const suggestions = heads ? (['ask_h1', 'ask_h2', 'ask_h3'] as const) : (['ask_m1', 'ask_m2', 'ask_m3'] as const);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const history: AssistantTurn[] = msgs.filter((m) => !m.error).map(({ role, text }) => ({ role, text }));
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    setBusy(true);
    try {
      const r = await api<AssistantReply>('/assistant/ask', { body: { question, history, lang } });
      setMsgs((m) => [...m, { role: 'assistant', text: r.answer, taskIds: r.taskIds, draft: r.draft }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', text: t(errorKey(e)), error: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const openTask = (id: string) => {
    setOpen(false);
    openDrawer({ type: 'task', id });
  };
  const review = (draft: TaskDraft) => {
    setOpen(false);
    openDrawer({ type: 'taskForm', draft });
  };

  return (
    <>
      <button ref={fabRef} className={`ask-fab ${open ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="askPanel">
        <Icon name={open ? 'x' : 'sparkle'} />
        <span>{t('askMasar')}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.section
            id="askPanel"
            className="ask-panel"
            role="dialog"
            aria-label={t('askMasar')}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ opacity: 0, y: 12, transition: { duration: 0.16 } }}
          >
            <header className="ask-h">
              <span className="ask-badge"><Icon name="sparkle" /></span>
              <div>
                <h2>{t('askMasar')}</h2>
                <p>{t('askSub')}</p>
              </div>
              {msgs.length > 0 && (
                <button className="icon-btn" onClick={() => setMsgs([])} aria-label={t('askNew')} title={t('askNew')}>
                  <Icon name="plus" />
                </button>
              )}
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label={t('askClose')}>
                <Icon name="x" />
              </button>
            </header>

            <div className="ask-list" ref={listRef} aria-live="polite">
              {!msgs.length && (
                <div className="ask-empty">
                  <p>{t('askHello', { name: tx(me.name).split(' ')[0] })}</p>
                  <span className="lbl">{t('askTry')}</span>
                  <div className="ask-sugs">
                    {suggestions.map((k) => (
                      <button key={k} onClick={() => ask(t(k))}>{t(k)}</button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`ask-msg ${m.role} ${m.error ? 'err' : ''}`}>
                  <div className="bubble">{m.text}</div>
                  {!!m.taskIds?.length && (
                    <div className="ask-links">
                      {m.taskIds.map((id) => {
                        const task = tasks?.find((x) => x.id === id);
                        return task ? (
                          <button key={id} className="chip" onClick={() => openTask(id)}>
                            <Icon name="tasks" className="sm" />
                            {tx(task.title)}
                          </button>
                        ) : null;
                      })}
                    </div>
                  )}
                  {m.draft && <DraftCard draft={m.draft} onReview={() => review(m.draft!)} />}
                </div>
              ))}
              {busy && (
                <div className="ask-msg assistant">
                  <div className="bubble thinking"><span className="dots" aria-hidden="true"><i /><i /><i /></span>{t('askThinking')}</div>
                </div>
              )}
            </div>

            <form
              className="ask-f"
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
            >
              <textarea
                ref={inputRef}
                className="input"
                rows={1}
                value={input}
                maxLength={500}
                placeholder={t('askPh')}
                aria-label={t('askPh')}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
              />
              <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()} aria-label={t('askSend')}>
                <Icon name="send" />
              </button>
            </form>
            <p className="ask-note">{t('askNote')}</p>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function DraftCard({ draft, onReview }: { draft: TaskDraft; onReview: () => void }) {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  return (
    <div className="ask-draft">
      <span className="lbl">{t('askDraft')}</span>
      <b>{draft.title}</b>
      <div className="meta">
        <span><Icon name="tasks" className="sm" />{t('askStepsN', { n: draft.steps.length })}</span>
        <span>{t('dueOn', { date: fmtDate(draft.dueDate, lang) })}</span>
        <span>{draft.assigneeIds.map((id) => tx(L.person(id)?.name ?? { en: '', ar: '' })).join(lang === 'ar' ? '، ' : ', ')}</span>
      </div>
      <ol>
        {draft.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      <button className="btn btn-primary btn-sm" onClick={onReview}>
        {t('askReview')}
      </button>
      <span className="hint">{t('askDraftNote')}</span>
    </div>
  );
}
