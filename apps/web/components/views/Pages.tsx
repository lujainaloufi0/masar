'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { progress, taskStatus, type TaskDTO } from '@masar/shared';
import { api, errorKey } from '@/lib/api';
import { keys, useActivity, useCompleted, useLookup, useTasks } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { dayDiff, fmtDate, localDay, todayISO } from '@/lib/format';
import { Icon } from '../Icon';
import { Avatar, Avatars, Empty, PageHead, Skeleton, useDL } from '../bits';
import { ProgressBar } from '../Progress';
import { useToast } from '../fx';
import { useDrawer } from '../drawer-ctx';
import { EmpStatus } from '../drawers/EmpDrawer';
import { FeedItem, NewTaskButton, TaskCard } from './common';

/* ---------- Tasks board ---------- */

export function TasksView() {
  const { t, tx } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const mine = me.role === 'member';
  const { data: tasks, isLoading } = useTasks();
  const [group, setGroup] = useState('all');
  const groups = [...L.groups.values()].filter((g) => g.deptId === me.deptId);
  let list = (tasks ?? []).filter((x) => (mine ? x.assigneeIds.includes(me.id) : x.deptId === me.deptId));
  if (!mine && group !== 'all') list = list.filter((x) => x.groupId === group);
  const cols: ['todo' | 'doing' | 'done', string, TaskDTO[]][] = [
    ['todo', 'var(--line)', list.filter((x) => taskStatus(x) === 'todo')],
    ['doing', 'var(--accent)', list.filter((x) => taskStatus(x) === 'doing')],
    ['done', 'var(--gold)', list.filter((x) => x.completedAt && dayDiff(x.completedAt, todayISO()) <= 30).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))],
  ];
  return (
    <>
      <PageHead title={t(mine ? 'nav_mytasks' : 'nav_tasks')} sub={<span>{t(mine ? 'tasks_member' : 'tasks_manager')}</span>} actions={mine ? null : <NewTaskButton />} />
      {!mine && (
        <div className="toolbar">
          <div className="seg" role="group" aria-label={t('group')}>
            <button aria-pressed={group === 'all'} onClick={() => setGroup('all')}>{t('allGroups')}</button>
            {groups.map((g) => (
              <button key={g.id} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{tx(g.name)}</button>
            ))}
          </div>
        </div>
      )}
      {isLoading ? (
        <Skeleton h={320} />
      ) : (
        <div className="board">
          {cols.map(([k, c, ts]) => (
            <section key={k} className="col" aria-label={t(k === 'done' ? 'doneRecent' : k)}>
              <div className="col-h"><i style={{ background: c }} />{t(k === 'done' ? 'doneRecent' : k)}<span className="c">{ts.length}</span></div>
              {ts.length ? ts.map((x, i) => <TaskCard key={x.id} task={x} index={i} />) : <div className="col-empty">{t('emptyCol')}</div>}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Groups ---------- */

export function GroupsView() {
  const { t, tx } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const { open } = useDrawer();
  const { data: tasks } = useTasks();
  const groups = [...L.groups.values()].filter((g) => g.deptId === me.deptId);
  return (
    <>
      <PageHead title={t('nav_groups')} sub={<span>{t('groups_sub', { dept: tx(L.dept(me.deptId)?.name) })}</span>} actions={<NewTaskButton />} />
      <div className="cards-auto">
        {groups.map((g) => {
          const ms = L.allPeople.filter((x) => x.groupIds.includes(g.id) && x.deptId === me.deptId && x.id !== me.id);
          const openT = (tasks ?? []).filter((x) => x.groupId === g.id && !x.completedAt);
          const done = (tasks ?? []).filter((x) => x.groupId === g.id && x.completedAt).length;
          return (
            <section key={g.id} className="panel">
              <div className="panel-head">
                <h2>{tx(g.name)}</h2>
                <span style={{ display: 'flex', gap: 6 }}>
                  <span className="chip ok">{t('openN', { n: openT.length })}</span>
                  <span className="chip">{t('doneN', { n: done })}</span>
                </span>
              </div>
              <div>
                <div className="section-t">{t('members')}<span>{ms.filter((x) => x.active).length}</span></div>
                <div className="members">
                  {ms.map((x) => (
                    <div key={x.id} className="member">
                      <Avatar p={x} />
                      <span className="t"><b>{tx(x.name)}</b><span>{tx(x.title)}</span></span>
                      {!x.active && <span className="chip">{t('inactiveTag')}</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="section-t">{t('openWork')}</div>
                {openT.length ? (
                  <div className="list">
                    {openT.map((x, i) => (
                      <button key={x.id} className="li" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }} onClick={() => open({ type: 'task', id: x.id })}>
                        <span className="main-t"><b>{tx(x.title)}</b></span>
                        <ProgressBar k={x.id} p={progress(x.steps)} index={i} label />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="faint">{t('noOpenWork')}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Completed board ---------- */

export function CompletedView() {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const DL = useDL();
  const { open } = useDrawer();
  const { data, isLoading } = useCompleted();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [sort, setSort] = useState<'recent' | 'days'>('recent');
  const rows = data ?? [];
  const deptOf = (r: (typeof rows)[number]) => (r.restricted ? r.deptId : r.task.deptId);
  const mineRows = rows.filter((r) => deptOf(r) === me.deptId);
  const shown = (scope === 'all' ? rows : mineRows).slice().sort((a, b) =>
    sort === 'days' ? a.daysTaken - b.daysTaken : (b.restricted ? '' : b.task.completedAt!).localeCompare(a.restricted ? '' : a.task.completedAt!),
  );
  const avg = (l: typeof rows) => (l.length ? Math.round((l.reduce((a, r) => a + r.daysTaken, 0) / l.length) * 10) / 10 : 0);
  const fastest = shown.reduce<(typeof rows)[number] | null>((m, r) => (!m || r.daysTaken < m.daysTaken ? r : m), null);
  const title = (r: (typeof rows)[number]) => tx(r.restricted ? r.title : r.task.title);
  const locked = (
    <span className="locked"><Icon name="lock" className="sm" />{t('restricted')}</span>
  );

  return (
    <>
      <PageHead title={t('nav_completed')} sub={<span>{t('comp_sub')}</span>} />
      <div className="toolbar">
        <div className="seg" role="group">
          <button aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>{t('scopeMine')}</button>
          <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>{t('scopeAll')}</button>
        </div>
        {scope === 'all' && me.role !== 'admin' && (
          <span className="locked"><Icon name="lock" className="sm" />{t('restrictedNote')}</span>
        )}
      </div>
      <section className="panel">
        <div className="summary-line">
          <div><b>{shown.length}</b><span>{t('tasksDone')}</span></div>
          <div><b>{DL(avg(mineRows))}</b><span>{t('avgDept', { dept: tx(L.dept(me.deptId)?.name) })}</span></div>
          <div><b>{DL(avg(rows))}</b><span>{t('avgOrg')}</span></div>
          {fastest && <div><b>{DL(fastest.daysTaken)}</b><span>{t('fastest')}: {title(fastest)}</span></div>}
        </div>
      </section>
      <section className="panel">
        {isLoading ? (
          <Skeleton h={260} />
        ) : shown.length ? (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('col_task')}</th>
                  <th>{t('col_dept')}</th>
                  <th aria-sort={sort === 'days' ? 'ascending' : 'none'}>
                    <button onClick={() => setSort(sort === 'days' ? 'recent' : 'days')}>
                      {t('col_days')}
                      {sort === 'days' && <Icon name="chevD" className="sm" />}
                    </button>
                  </th>
                  <th>{t('col_completedOn')}</th>
                  <th>{t('col_team')}</th>
                  <th>{t('col_steps')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const d = L.dept(deptOf(r));
                  const id = r.restricted ? r.id : r.task.id;
                  const go = () => !r.restricted && open({ type: 'task', id });
                  return (
                    <tr
                      key={id}
                      className={r.restricted ? '' : 'click'}
                      tabIndex={r.restricted ? undefined : 0}
                      onClick={go}
                      onKeyDown={(e) => e.key === 'Enter' && go()}
                    >
                      <td style={{ minWidth: 220 }}><b style={{ fontWeight: 500 }}>{title(r)}</b></td>
                      <td><span className="chip"><span className="d" style={{ background: d?.color }} />{tx(d?.name)}</span></td>
                      <td><span className="days">{DL(r.daysTaken)}</span></td>
                      <td>{r.restricted ? locked : fmtDate(r.task.completedAt!, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td>{r.restricted ? locked : <Avatars ids={r.task.assigneeIds} person={(x) => L.person(x)} max={3} />}</td>
                      <td>{r.restricted ? locked : r.task.steps.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="completed">{t('noCompleted')}</Empty>
        )}
      </section>
    </>
  );
}

/* ---------- Employees ---------- */

export function EmployeesView() {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const { open } = useDrawer();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [inactive, setInactive] = useState(false);
  const hr = me.role === 'hr';
  const ql = q.trim().toLowerCase();
  const list = L.allPeople
    .filter((x) => (inactive || x.active) && (dept === 'all' || x.deptId === dept) && (!ql || x.name.en.toLowerCase().includes(ql) || x.name.ar.includes(q.trim()) || x.empId.toLowerCase().includes(ql)))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.empId.localeCompare(b.empId));
  const n = L.allPeople.filter((x) => x.active).length;
  return (
    <>
      <PageHead
        title={t('nav_employees')}
        sub={<span>{t(hr ? 'emp_subHr' : 'emp_sub', { n })}</span>}
        actions={hr ? <button className="btn btn-primary" onClick={() => open({ type: 'emp', id: null })}><Icon name="userPlus" />{t('addEmployee')}</button> : null}
      />
      <div className="toolbar">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          <div className="search" style={{ maxWidth: 300 }}>
            <Icon name="search" />
            <input type="search" placeholder={t('searchEmp')} aria-label={t('searchEmp')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" style={{ width: 'auto', minWidth: 190 }} aria-label={t('col_dept')} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">{t('allDepts')}</option>
            {[...L.depts.values()].map((d) => <option key={d.id} value={d.id}>{tx(d.name)}</option>)}
          </select>
        </div>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
          {t('showInactive')}
        </label>
      </div>
      <section className="panel">
        {list.length ? (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr><th>{t('col_emp')}</th><th>{t('col_id')}</th><th>{t('col_dept')}</th><th>{t('col_role')}</th><th>{t('col_status')}</th></tr>
              </thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id} className={`click ${x.active ? '' : 'inactive'}`} tabIndex={0} onClick={() => open({ type: 'emp', id: x.id })} onKeyDown={(e) => e.key === 'Enter' && open({ type: 'emp', id: x.id })}>
                    <td><span className="cell-person"><Avatar p={x} /><span><b>{tx(x.name)}</b><span>{tx(x.title)}</span></span></span></td>
                    <td><span className="mono" dir="ltr">{x.empId}</span></td>
                    <td>
                      {tx(L.dept(x.deptId)?.name)}
                      <div className="faint" style={{ fontSize: 12.5 }}>{x.groupIds.map((g) => tx(L.group(g)?.name)).join(lang === 'ar' ? '، ' : ', ')}</div>
                    </td>
                    <td>{t('role_' + x.role)}</td>
                    <td><EmpStatus p={x} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="search">{t('noEmp')}</Empty>
        )}
      </section>
    </>
  );
}

/* ---------- Departments (admin) ---------- */

export function DepartmentsView() {
  const { t, tx } = usePrefs();
  const L = useLookup();
  const qc = useQueryClient();
  const toast = useToast();
  const [names, setNames] = useState<Record<string, string>>({});
  const [bad, setBad] = useState<string | null>(null);

  const refresh = () => {
    for (const k of [keys.bootstrap, keys.employees, keys.activity]) qc.invalidateQueries({ queryKey: k });
  };
  const setHead = async (deptId: string, userId: string) => {
    try {
      await api(`/departments/${deptId}/head`, { method: 'PATCH', body: { userId } });
      toast(t('headChanged'));
      refresh();
    } catch (e) {
      toast(t(errorKey(e)), 'err');
    }
  };
  const addGroup = async (e: React.FormEvent, deptId: string) => {
    e.preventDefault();
    const name = (names[deptId] ?? '').trim();
    if (!name) {
      setBad(deptId);
      return;
    }
    try {
      await api(`/departments/${deptId}/groups`, { body: { name } });
      toast(t('groupAdded', { name }));
      setNames((n) => ({ ...n, [deptId]: '' }));
      setBad(null);
      refresh();
    } catch (x) {
      toast(t(errorKey(x)), 'err');
    }
  };

  return (
    <>
      <PageHead title={t('nav_departments')} sub={<span>{t('dept_sub')} {t('headHint')}</span>} />
      <div className="cards-auto">
        {[...L.depts.values()].map((d) => {
          const people = L.allPeople.filter((p) => p.deptId === d.id && p.active);
          const groups = [...L.groups.values()].filter((g) => g.deptId === d.id);
          return (
            <section key={d.id} className="panel">
              <div className="panel-head">
                <h2 style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                  {tx(d.name)}
                </h2>
                <span className="aside">{t('peopleN', { n: people.length })}</span>
              </div>
              <div className="field">
                <label htmlFor={`head-${d.id}`}>{t('changeHead')}</label>
                <select className="select" id={`head-${d.id}`} value={d.headId ?? ''} onChange={(e) => e.target.value && setHead(d.id, e.target.value)}>
                  {!d.headId && <option value="">{t('noHead')}</option>}
                  {people.map((p) => <option key={p.id} value={p.id}>{tx(p.name)}</option>)}
                </select>
              </div>
              <div>
                <div className="section-t">{t('groupsL')}<span>{groups.length}</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {groups.map((g) => <span key={g.id} className="chip line">{tx(g.name)}</span>)}
                </div>
              </div>
              <form className="inline-form" onSubmit={(e) => addGroup(e, d.id)}>
                <input
                  className="input"
                  placeholder={t('groupPh')}
                  aria-label={t('groupPh')}
                  aria-invalid={bad === d.id}
                  value={names[d.id] ?? ''}
                  maxLength={80}
                  onChange={(e) => setNames((n) => ({ ...n, [d.id]: e.target.value }))}
                />
                <button className="btn btn-ghost btn-sm" type="submit" style={{ height: 36 }}>
                  <Icon name="plus" className="sm" />
                  {t('addGroup')}
                </button>
              </form>
            </section>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Activity log ---------- */

export function ActivityView() {
  const { t, lang } = usePrefs();
  const { data, isLoading } = useActivity();
  const byDay = useMemo(() => {
    const m = new Map<string, NonNullable<typeof data>>();
    for (const e of data ?? []) {
      const d = localDay(e.at);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(e);
    }
    return [...m.entries()];
  }, [data]);
  return (
    <>
      <PageHead title={t('nav_activity')} sub={<span>{t('act_sub')}</span>} />
      <section className="panel">
        {isLoading ? (
          <Skeleton h={300} />
        ) : byDay.length ? (
          byDay.map(([d, es]) => {
            const dd = dayDiff(d, todayISO());
            const label = dd === 0 ? t('today') : dd === 1 ? t('yesterday') : fmtDate(d, lang, { weekday: 'long', day: 'numeric', month: 'long' });
            return (
              <div key={d}>
                <div className="day-h">{label}</div>
                <div className="feed">{es.map((e) => <FeedItem key={e.id} e={e} />)}</div>
              </div>
            );
          })
        ) : (
          <Empty icon="activity">{t('noActivity')}</Empty>
        )}
      </section>
    </>
  );
}
