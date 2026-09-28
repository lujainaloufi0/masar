'use client';
import { animate } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { canManageTask, canTickSteps, daysTaken, progress, taskStatus, type TaskDTO } from '@masar/shared';
import { api, errorKey } from '@/lib/api';
import { dropTask, keys, putTask, useLookup, useTask } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { fillMs, fmtDate, fmtLong, reducedMotion } from '@/lib/format';
import { stepsLeftLabel } from '@/lib/i18n';
import { Icon } from '../Icon';
import { Avatar, Empty, Skeleton, useDL } from '../bits';
import { celebrateFx, shake, useToast } from '../fx';
import { EASE_IO } from '../Progress';
import { useDrawer } from '../drawer-ctx';

const R = 48;
const C = 2 * Math.PI * R;

export function TaskDrawer({ id }: { id: string }) {
  const { t } = usePrefs();
  const { close } = useDrawer();
  const { data: task, error, isLoading } = useTask(id);

  if (!task) {
    return (
      <>
        <div className="drawer-h">
          <h2 id="dTitle">{isLoading ? t('loading') : t('errNotFound')}</h2>
          <button className="icon-btn" onClick={close} aria-label={t('close')}><Icon name="x" /></button>
        </div>
        <div className="drawer-b">{error ? <Empty icon="alert">{t(errorKey(error))}</Empty> : <Skeleton h={150} />}</div>
      </>
    );
  }
  return <TaskBody task={task} key={task.id} />;
}

type Phase = 'idle' | 'done' | 'settled';

function TaskBody({ task }: { task: TaskDTO }) {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const qc = useQueryClient();
  const toast = useToast();
  const DL = useDL();
  const { open, close } = useDrawer();
  const [confirm, setConfirm] = useState<null | 'cancel' | 'delete'>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(task.completedAt ? 'settled' : 'idle');

  const p = progress(task.steps);
  const canTick = canTickSteps(me, task);
  const canManage = canManageTask(me, task);
  const dept = L.dept(task.deptId);
  const group = L.group(task.groupId);

  /* ---------- Ring ---------- */
  const ringVal = useRef<SVGCircleElement>(null);
  const ringPct = useRef<HTMLSpanElement>(null);
  const ringBox = useRef<HTMLDivElement>(null);
  const shown = useRef(task.completedAt ? 1 : 0);
  const stop = useRef<() => void>(() => {});
  const draw = (v: number) => {
    shown.current = v;
    if (ringVal.current) ringVal.current.style.strokeDashoffset = String(C * (1 - v));
    if (ringPct.current) ringPct.current.firstChild!.textContent = String(Math.round(v * 100));
  };
  const animateRing = (to: number, done?: () => void) => {
    stop.current();
    const from = shown.current;
    const ctl = animate(from, to, { duration: fillMs(to - from) / 1000, ease: EASE_IO, onUpdate: draw, onComplete: done });
    stop.current = () => ctl.stop();
  };

  // First open: fill from zero, a moment after the panel has slid in.
  useEffect(() => {
    if (task.completedAt) {
      draw(1);
      return;
    }
    draw(0);
    const timer = setTimeout(() => animateRing(progress(task.steps)), 250);
    return () => {
      clearTimeout(timer);
      stop.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const first = useRef(true);
  const prevCompleted = useRef(task.completedAt);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const was = prevCompleted.current;
    prevCompleted.current = task.completedAt;
    if (!was && task.completedAt) {
      // 1) the ring fills slowly  2) it shakes  3) it turns gold, the tick draws, confetti
      animateRing(1, () => {
        shake(ringBox.current);
        setTimeout(() => {
          setPhase('done');
          const r = ringBox.current?.getBoundingClientRect();
          if (r) celebrateFx(r.left + r.width / 2, r.top + r.height / 2);
          toast(t('toastDone', { d: DL(daysTaken(task.createdAt, task.completedAt!)) }), 'gold');
        }, reducedMotion() ? 0 : 560);
      });
      return;
    }
    if (was && !task.completedAt) {
      setPhase('idle');
      toast(t('toastReopen'));
    }
    animateRing(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, task.completedAt]);

  /* ---------- Actions ---------- */
  const run = async (key: string, fn: () => Promise<TaskDTO | void>, ok?: string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (r) putTask(qc, r);
      if (ok) toast(t(ok));
      return true;
    } catch (e) {
      toast(t(errorKey(e)), 'err');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (stepId: string) => {
    if (!canTick || busy === stepId) return;
    const step = task.steps.find((s) => s.id === stepId)!;
    const next = !step.done;
    // Show the tick at once; the server's answer replaces it a moment later.
    const optimistic: TaskDTO = {
      ...task,
      steps: task.steps.map((s) => (s.id === stepId ? { ...s, done: next, doneById: next ? me.id : null, doneAt: next ? new Date().toISOString() : null } : s)),
    };
    qc.setQueryData(keys.task(task.id), optimistic);
    const ok = await run(stepId, async () => (await api<{ task: TaskDTO }>(`/tasks/${task.id}/steps/${stepId}/toggle`, { body: { done: next } })).task);
    if (!ok) qc.setQueryData(keys.task(task.id), task);
  };

  /* ---------- Text ---------- */
  const left = task.steps.filter((s) => !s.done).length;
  const showDone = phase !== 'idle' && !!task.completedAt;
  const heading = showDone ? t('doneTitle') : t('pct', { p: Math.round(p * 100) });
  const sub = showDone
    ? t('doneInBy', { d: DL(daysTaken(task.createdAt, task.completedAt!)), names: task.assigneeIds.map((a) => tx(L.person(a)?.name).split(' ')[0]).join(lang === 'ar' ? ' و' : ' and ') })
    : p === 0 ? t('notStartedMsg') : left ? stepsLeftLabel(left, lang) : '';
  const st = taskStatus(task);
  const chipStatus = st === 'done' && !showDone ? 'doing' : st;

  const candidates = L.allPeople.filter((x) => x.active && x.deptId === task.deptId && !task.assigneeIds.includes(x.id) && x.role !== 'hr');
  const editable = canManage && !task.cancelledAt && !task.completedAt;

  return (
    <>
      <div className="drawer-h">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {dept && <span className="chip"><span className="d" style={{ background: dept.color }} />{tx(dept.name)}</span>}
            {group && <span className="chip line">{tx(group.name)}</span>}
          </span>
          <h2 id="dTitle">{tx(task.title)}</h2>
        </div>
        {canManage && !task.cancelledAt && (
          <button className="icon-btn" onClick={() => open({ type: 'taskForm', editId: task.id })} aria-label={t('editTask')} title={t('editTask')}>
            <Icon name="edit" />
          </button>
        )}
        <button className="icon-btn" onClick={close} aria-label={t('close')}><Icon name="x" /></button>
      </div>
      <div className="drawer-b">
        {task.cancelledAt && (
          <div className="banner">
            <Icon name="x" />
            <p>{t('cancelledBanner', { name: tx(L.person(task.cancelledById)?.name), date: fmtDate(task.cancelledAt, lang, { day: 'numeric', month: 'long' }) })}</p>
            {canManage && (
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('restore', () => api(`/tasks/${task.id}/restore`, { method: 'POST' }), 'toastRestored')}>
                <Icon name="reset" className="sm" />
                {t('restoreTask')}
              </button>
            )}
          </div>
        )}
        {task.flagged && !task.cancelledAt && (
          <div className="banner"><Icon name="alert" /><p>{t('flaggedTask')}</p></div>
        )}

        <div className={`hero ${phase === 'done' ? 'done' : phase === 'settled' ? 'done settled' : ''}`}>
          <div className="pring" ref={ringBox}>
            <svg viewBox="0 0 112 112" aria-hidden="true">
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" style={{ stopColor: 'var(--accent)' }} />
                  <stop offset="1" style={{ stopColor: 'var(--ring-end)' }} />
                </linearGradient>
              </defs>
              <circle className="trk" cx="56" cy="56" r={R} />
              <circle ref={ringVal} className="val" cx="56" cy="56" r={R} stroke="url(#ringGrad)" strokeDasharray={C} style={{ strokeDashoffset: C * (1 - shown.current) }} />
            </svg>
            <span className="glow" />
            <div className="center">
              <span className="pct" ref={ringPct} role="img" aria-label={t('pct', { p: Math.round(p * 100) })}>
                {Math.round(shown.current * 100)}
                <small>%</small>
              </span>
              <svg className="tick" viewBox="0 0 48 48" aria-hidden="true"><path d="M13 25l7 7 15-16" /></svg>
            </div>
          </div>
          <div className="txt">
            <span className={`status chip ${chipStatus === 'done' ? 'gold' : chipStatus === 'doing' ? 'ok' : chipStatus === 'cancelled' ? 'warn' : ''}`}>{t(chipStatus)}</span>
            <h3>{heading}</h3>
            {sub && <p>{sub}</p>}
          </div>
        </div>

        {tx(task.desc) && (
          <div>
            <div className="section-t">{t('details')}</div>
            <p className="muted" style={{ maxWidth: '62ch', whiteSpace: 'pre-wrap' }}>{tx(task.desc)}</p>
          </div>
        )}

        <div>
          <div className="section-t">
            {t('steps')}
            <span>{t('stepsOf', { a: task.steps.filter((s) => s.done).length, b: task.steps.length })}</span>
          </div>
          <div className="steps">
            {task.steps.map((s) => {
              const by = s.done && s.doneById ? t('doneBy', { name: tx(L.person(s.doneById)?.name) || t('someone'), date: fmtDate(s.doneAt!, lang) }) : '';
              const inner = (
                <>
                  <span className="box"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
                  <span className="t">
                    <p>{tx(s.text)}</p>
                    {by && <span>{by}</span>}
                  </span>
                </>
              );
              return canTick ? (
                <button key={s.id} type="button" className={`step can ${s.done ? 'on' : ''}`} role="checkbox" aria-checked={s.done} aria-busy={busy === s.id} onClick={() => toggle(s.id)}>
                  {inner}
                </button>
              ) : (
                <div key={s.id} className={`step ${s.done ? 'on' : ''}`}>{inner}</div>
              );
            })}
          </div>
          {!canTick && !task.cancelledAt && (
            <p className="readonly-note"><Icon name="lock" className="sm" />{t('readOnly')}</p>
          )}
        </div>

        <div>
          <div className="section-t">{t('assignedTo')}</div>
          <div className="people">
            {task.assigneeIds.map((a) => {
              const x = L.person(a);
              return (
                <span key={a} className={`person-chip ${x?.active === false ? 'off' : ''}`}>
                  <Avatar p={x} />
                  {tx(x?.name) || t('someone')}
                  {x?.active === false && <span className="faint"> ({t('inactiveTag')})</span>}
                  {editable && task.assigneeIds.length > 1 && (
                    <button
                      disabled={!!busy}
                      onClick={() => run('unassign', () => api(`/tasks/${task.id}/assignees/${a}`, { method: 'DELETE' }))}
                      aria-label={t('remove', { name: tx(x?.name) })}
                    >
                      <Icon name="x" className="sm" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          {editable && candidates.length > 0 && (
            <div className="field" style={{ marginTop: 12, maxWidth: 300 }}>
              <label htmlFor="addAs">{t('addPerson')}</label>
              <select
                className="select"
                id="addAs"
                value=""
                disabled={!!busy}
                onChange={(e) => e.target.value && run('assign', () => api(`/tasks/${task.id}/assignees`, { body: { userId: e.target.value } }))}
              >
                <option value="">{t('choose')}</option>
                {candidates.map((x) => (
                  <option key={x.id} value={x.id}>{tx(x.name)}{x.groupIds[0] ? `, ${tx(L.group(x.groupIds[0])?.name)}` : ''}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <dl className="kv">
          <dt>{t('createdBy')}</dt><dd>{tx(L.person(task.createdById)?.name) || t('someone')}</dd>
          <dt>{t('created')}</dt><dd>{fmtLong(task.createdAt, lang)}</dd>
          <dt>{t('due')}</dt><dd>{fmtLong(task.dueDate, lang)}</dd>
        </dl>

        {canManage && (
          <div className="manage">
            <div className="section-t">{t('manageTask')}</div>
            <p className="faint" style={{ fontSize: 12.5, marginBottom: 12 }}>{t('manageHint')}</p>
            {confirm ? (
              <div className="confirm" role="alertdialog" aria-labelledby="tq">
                <p id="tq"><b>{t(confirm === 'cancel' ? 'cancelQ' : 'deleteQ')}</b></p>
                <p>{t(confirm === 'cancel' ? 'cancelBody' : 'deleteBody')}</p>
                <div className="acts">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    data-autofocus
                    disabled={!!busy}
                    onClick={async () => {
                      if (confirm === 'cancel') {
                        if (await run('cancel', () => api(`/tasks/${task.id}/cancel`, { method: 'POST' }), 'toastCancelled')) setConfirm(null);
                      } else {
                        if (await run('delete', () => api(`/tasks/${task.id}`, { method: 'DELETE' }).then(() => undefined), 'toastDeleted')) {
                          dropTask(qc, task.id);
                          close();
                        }
                      }
                    }}
                  >
                    <Icon name={confirm === 'cancel' ? 'x' : 'trash'} className="sm" />
                    {t(confirm === 'cancel' ? 'cancelTask' : 'deleteTask')}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>{t('keepTask')}</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!task.cancelledAt && (
                  <>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => open({ type: 'taskForm', editId: task.id })}>
                      <Icon name="edit" className="sm" />{t('editTask')}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm('cancel')}>
                      <Icon name="x" className="sm" />{t('cancelTask')}
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setConfirm('delete')}>
                  <Icon name="trash" className="sm" />{t('deleteTask')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
