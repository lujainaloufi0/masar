'use client';
import { useActivity, useLookup, useStats, useTasks } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { dayDiff, fmtDate, todayISO, isLive } from '@/lib/format';
import { Icon } from '../Icon';
import { Avatar, DueInfo, Empty, PageHead, Skeleton, useDL } from '../bits';
import { useDrawer } from '../drawer-ctx';
import { ScheduledPanel } from './Pages';
import { AvgPanel, DateLine, DeptProgressPanel, Feed, Greeting, NewTaskButton, TaskCard, ViewAll } from './common';

export function Overview() {
  const L = useLookup();
  if (L.me?.role === 'hr') return <HrOverview />;
  if (L.me?.role === 'admin') return <AdminOverview />;
  return <WorkOverview />;
}

const first = (s: string) => s.split(' ')[0];

function WorkOverview() {
  const { t, tx } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const { open } = useDrawer();
  const { data: tasks, isLoading } = useTasks();
  const { data: activity } = useActivity();
  const mine = me.role === 'member';
  const active = (tasks ?? [])
    .filter((x) => !x.completedAt && isLive(x) && (mine ? x.assigneeIds.includes(me.id) : x.deptId === me.deptId))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const soon = active.filter((x) => dayDiff(todayISO(), x.dueDate) <= 7);
  const flagged = mine ? [] : active.filter((x) => x.flagged);
  const scheduled = mine ? [] : (tasks ?? []).filter((x) => x.deptId === me.deptId && !x.cancelledAt && !isLive(x)).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const dept = tx(L.dept(me.deptId)?.name);

  return (
    <>
      <PageHead title={<Greeting name={first(tx(me.name))} />} sub={<DateLine />} actions={mine ? null : <NewTaskButton />} />
      {flagged.length > 0 && (
        <div className="banner">
          <Icon name="alert" />
          <p>{t('flagBanner', { n: flagged.length })}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => open({ type: 'task', id: flagged[0].id })}>{t('review')}</button>
        </div>
      )}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel-head">
          <h2 style={{ fontSize: 16 }}>{mine ? t('myActive') : t('deptActive', { dept })}</h2>
          <ViewAll href="/tasks" />
        </div>
        {isLoading ? (
          <Skeleton h={150} />
        ) : active.length ? (
          <div className="strip">{active.slice(0, 4).map((x, i) => <TaskCard key={x.id} task={x} index={i} />)}</div>
        ) : (
          <div className="panel"><Empty icon="tasks">{t('noActiveTasks')}</Empty></div>
        )}
      </section>
      {scheduled.length > 0 && <ScheduledPanel tasks={scheduled} />}
      <div className="grid-2">
        <DeptProgressPanel deptId={me.deptId} />
        <AvgPanel highlight={me.deptId} />
      </div>
      <div className="grid-2b">
        <section className="panel">
          <div className="panel-head"><h2>{t('dueSoon')}</h2></div>
          {soon.length ? (
            <div className="list">
              {soon.map((x) => (
                <button key={x.id} className="li" onClick={() => open({ type: 'task', id: x.id })}>
                  <span className="main-t"><b>{tx(x.title)}</b><span>{tx(L.group(x.groupId)?.name)}</span></span>
                  <DueInfo task={x} />
                </button>
              ))}
            </div>
          ) : (
            <Empty icon="calendar">{t('nothingDue')}</Empty>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>{t('recent')}</h2>
            {!mine && <ViewAll href="/activity" />}
          </div>
          <Feed items={(activity ?? []).slice(0, 5)} />
        </section>
      </div>
    </>
  );
}

function HrOverview() {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const { open } = useDrawer();
  const { data: activity } = useActivity();
  const everyone = L.allPeople;
  const active = everyone.filter((x) => x.active);
  const joined = active.filter((x) => dayDiff(x.joinedAt, todayISO()) <= 30);
  const pending = active.filter((x) => x.pendingPassword);
  const off = everyone.filter((x) => !x.active);
  const depts = [...L.depts.values()];
  const count = (id: string) => active.filter((x) => x.deptId === id).length;
  const max = Math.max(1, ...depts.map((d) => count(d.id)));
  return (
    <>
      <PageHead
        title={<Greeting name={first(tx(me.name))} />}
        sub={<span>{t('ov_hr', { org: tx(L.boot?.org.name) })}</span>}
        actions={
          <button className="btn btn-primary" onClick={() => open({ type: 'emp', id: null })}>
            <Icon name="userPlus" />{t('addEmployee')}
          </button>
        }
      />
      <section className="panel">
        <div className="summary-line">
          <div><b>{active.length}</b><span>{t('activeEmp')}</span></div>
          <div><b>{joined.length}</b><span>{t('joined30')}</span></div>
          <div><b>{pending.length}</b><span>{t('waitingFirst')}</span></div>
          <div><b>{off.length}</b><span>{t('deactivatedN')}</span></div>
        </div>
      </section>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>{t('headcount')}</h2></div>
          <div className="hbars">
            {depts.map((d) => (
              <div key={d.id} className={`hbar ${d.id === me.deptId ? 'mine' : ''}`}>
                <span className="n"><span>{tx(d.name)}</span></span>
                <span className="track"><i style={{ width: `${(count(d.id) / max) * 82}%` }} /><b>{count(d.id)}</b></span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>{t('pendingList')}</h2></div>
          {pending.length ? (
            <div className="list">
              {pending.map((x) => (
                <button key={x.id} className="li" onClick={() => open({ type: 'emp', id: x.id })}>
                  <Avatar p={x} />
                  <span className="main-t"><b>{tx(x.name)}</b><span>{tx(L.dept(x.deptId)?.name)}</span></span>
                  <span className="due">{t('addedOn', { date: fmtDate(x.joinedAt, lang) })}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon="userCheck">{t('pendingEmpty')}</Empty>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-head"><h2>{t('recentChanges')}</h2><ViewAll href="/activity" /></div>
        <Feed items={(activity ?? []).filter((e) => e.empId && !e.taskId).slice(0, 6)} />
      </section>
    </>
  );
}

function AdminOverview() {
  const { t, tx } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const DL = useDL();
  const { data: stats } = useStats();
  const { data: activity } = useActivity();
  return (
    <>
      <PageHead title={<Greeting name={first(tx(me.name))} />} sub={<span>{t('ov_admin', { org: tx(L.boot?.org.name) })}</span>} />
      <section className="panel">
        <div className="panel-head"><h2>{t('nav_departments')}</h2><ViewAll href="/departments" /></div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('col_dept')}</th><th>{t('col_head')}</th><th>{t('col_people')}</th><th>{t('col_open')}</th><th>{t('col_done30')}</th><th>{t('col_avg')}</th>
              </tr>
            </thead>
            <tbody>
              {[...L.depts.values()].map((d) => {
                const s = stats?.find((x) => x.deptId === d.id);
                const head = L.person(d.headId);
                return (
                  <tr key={d.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color }} />
                        <b style={{ fontWeight: 500 }}>{tx(d.name)}</b>
                      </span>
                    </td>
                    <td>
                      {head ? (
                        <span className="cell-person" style={{ minWidth: 0 }}><Avatar p={head} /><span>{tx(head.name)}</span></span>
                      ) : (
                        <span className="faint">{t('noHead')}</span>
                      )}
                    </td>
                    <td>{s?.people ?? '–'}</td>
                    <td>{s?.open ?? '–'}</td>
                    <td>{s?.done30 ?? '–'}</td>
                    <td>{s?.avgDays60 != null ? DL(Math.round(s.avgDays60 * 10) / 10) : <span className="faint">–</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid-2">
        <AvgPanel highlight={null} />
        <section className="panel">
          <div className="panel-head"><h2>{t('recent')}</h2><ViewAll href="/activity" /></div>
          <Feed items={(activity ?? []).slice(0, 6)} />
        </section>
      </div>
    </>
  );
}
