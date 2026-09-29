'use client';
import Link from 'next/link';
import { progress, taskStatus, type ActivityDTO, type TaskDTO } from '@masar/shared';
import { useLookup, useStats, useTasks } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { dayDiff, fmtDate, fmtWhen, hijri, todayISO, isLive } from '@/lib/format';
import { activityIcon, activityText } from '@/lib/messages';
import { Icon } from '../Icon';
import { Avatars, DueInfo, Empty, useDL } from '../bits';
import { ProgressBar } from '../Progress';
import { useDrawer } from '../drawer-ctx';

export function TaskCard({ task, index = 0, showGroup = true }: { task: TaskDTO; index?: number; showGroup?: boolean }) {
  const { t, tx } = usePrefs();
  const L = useLookup();
  const { open } = useDrawer();
  return (
    <button className={`tcard ${task.completedAt ? 'done' : ''}`} onClick={() => open({ type: 'task', id: task.id })}>
      {task.flagged && (
        <span className="flag" title={t('flaggedTask')}>
          <Icon name="flag" className="sm" />
          <span className="sr">{t('flaggedTask')}</span>
        </span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {showGroup && <span className="chip line" style={{ alignSelf: 'flex-start' }}>{tx(L.group(task.groupId)?.name)}</span>}
        <h3>{tx(task.title)}</h3>
      </div>
      <ProgressBar k={task.id} p={progress(task.steps)} index={index} label />
      <div className="meta">
        <DueInfo task={task} />
        <Avatars ids={task.assigneeIds} person={(id) => L.person(id)} max={3} />
      </div>
    </button>
  );
}

export function DateLine() {
  const { lang } = usePrefs();
  return (
    <>
      <span>
        <Icon name="calendar" className="sm" />
        {fmtDate(todayISO(), lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </span>
      <span className="faint">{hijri(lang)}</span>
    </>
  );
}

export function Greeting({ name }: { name: string }) {
  const { t } = usePrefs();
  const h = new Date().getHours();
  return <>{t(h >= 15 || h < 4 ? 'greetEve' : 'greet', { name })}</>;
}

export function NewTaskButton() {
  const { t } = usePrefs();
  const { open } = useDrawer();
  return (
    <button className="btn btn-primary" onClick={() => open({ type: 'taskForm' })}>
      <Icon name="plus" />
      {t('newTask')}
    </button>
  );
}

export function AvgPanel({ highlight }: { highlight: string | null }) {
  const { t, tx } = usePrefs();
  const L = useLookup();
  const DL = useDL();
  const { data } = useStats();
  const rows = (data ?? []).filter((r) => r.avgDays60 != null).sort((a, b) => a.avgDays60! - b.avgDays60!);
  const max = Math.max(1, ...rows.map((r) => r.avgDays60!));
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{t('avgDays')}</h2>
        {highlight && (
          <span className="legend"><span><i style={{ background: 'var(--accent)' }} />{t('yourDept')}</span></span>
        )}
      </div>
      {rows.length ? (
        <div className="hbars">
          {rows.map((r) => (
            <div key={r.deptId} className={`hbar ${r.deptId === highlight ? 'mine' : ''}`}>
              <span className="n"><span>{tx(L.dept(r.deptId)?.name)}</span></span>
              <span className="track">
                <i style={{ width: `${Math.max(4, (r.avgDays60! / max) * 100) * 0.82}%` }} />
                <b>{DL(Math.round(r.avgDays60! * 10) / 10)}</b>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="faint">{t('noAvg')}</p>
      )}
      <p className="chart-note">{t('avgDaysNote')}</p>
    </section>
  );
}

export function DeptProgressPanel({ deptId }: { deptId: string }) {
  const { t, tx } = usePrefs();
  const L = useLookup();
  const { data: tasks } = useTasks();
  const all = (tasks ?? []).filter((x) => x.deptId === deptId);
  const open = all.filter((x) => !x.completedAt && isLive(x));
  const done30 = all.filter((x) => x.completedAt && dayDiff(x.completedAt, todayISO()) <= 30);
  const c = { todo: open.filter((x) => taskStatus(x, todayISO()) === 'todo').length, doing: open.filter((x) => taskStatus(x, todayISO()) === 'doing').length, done: done30.length };
  const groups = [...L.groups.values()].filter((g) => g.deptId === deptId);
  const segs: ['done' | 'doing' | 'todo', string, string][] = [
    ['done', 'var(--gold)', 'doneRecent'],
    ['doing', 'var(--accent)', 'doing'],
    ['todo', 'var(--line)', 'todo'],
  ];
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{t('deptProgress')}</h2>
        <span className="aside">{t('openTasksN', { n: open.length })}</span>
      </div>
      <div className="stack-bar" aria-hidden="true">
        {segs.filter(([k]) => c[k]).map(([k, col], i) => (
          <span key={k} style={{ flex: c[k], background: col, animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
      <div className="legend">
        {segs.map(([k, col, lbl]) => (
          <span key={k}><i style={{ background: col }} />{t(lbl)} <b>{c[k]}</b></span>
        ))}
      </div>
      <div>
        <div className="section-t" style={{ marginBottom: 12 }}>{t('byGroup')}</div>
        <div className="grp-rows">
          {groups.map((g, i) => {
            const ts = open.filter((x) => x.groupId === g.id);
            const total = ts.reduce((a, x) => a + x.steps.length, 0);
            const done = ts.reduce((a, x) => a + x.steps.filter((s) => s.done).length, 0);
            return (
              <div key={g.id} className="grp-row">
                <span className="n">{tx(g.name)}</span>
                <ProgressBar k={`g-${g.id}`} p={total ? done / total : 0} index={i} />
                <span className="v">{total ? t('stepsOf', { a: done, b: total }) : t('noOpenInGroup')}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FeedItem({ e }: { e: ActivityDTO }) {
  const { t, lang } = usePrefs();
  const L = useLookup();
  const { open } = useDrawer();
  const [ic, kind] = activityIcon(e.type);
  const body = (
    <>
      <span className={`ic ${kind}`}><Icon name={ic} className="sm" /></span>
      <div>
        <p>{activityText(e, lang, L, t('someone'))}</p>
        <time dateTime={e.at}>{fmtWhen(e.at, lang, t)}</time>
      </div>
    </>
  );
  const canOpen = e.taskId && e.type !== 'task_deleted';
  return canOpen ? (
    <button className="ev" onClick={() => open({ type: 'task', id: e.taskId! })}>{body}</button>
  ) : (
    <div className="ev">{body}</div>
  );
}

export function Feed({ items }: { items: ActivityDTO[] }) {
  const { t } = usePrefs();
  if (!items.length) return <p className="faint">{t('noActivity')}</p>;
  return <div className="feed">{items.map((e) => <FeedItem key={e.id} e={e} />)}</div>;
}

export function ViewAll({ href }: { href: string }) {
  const { t } = usePrefs();
  return (
    <Link href={href} className="link">
      {t('viewAll')}
      <Icon name="chevR" className="sm flip" />
    </Link>
  );
}

export function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className="panel"><Empty icon="tasks">{children}</Empty></div>;
}
