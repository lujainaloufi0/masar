'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { canViewTask, ROLES, type PersonDTO, type Role } from '@masar/shared';
import { api, ApiError, errorKey } from '@/lib/api';
import { keys, useLookup, useTasks } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { fmtLong } from '@/lib/format';
import { Icon } from '../Icon';
import { Avatar, FieldErr, StatusChip } from '../bits';
import { useToast } from '../fx';
import { useDrawer } from '../drawer-ctx';

export function EmpStatus({ p }: { p: PersonDTO }) {
  const { t } = usePrefs();
  if (!p.active) return <span className="chip">{t('status_inactive')}</span>;
  if (p.pendingPassword) return <span className="chip warn">{t('status_pending')}</span>;
  return <span className="chip ok">{t('status_active')}</span>;
}

export function EmpDrawer({ id }: { id: string | null }) {
  const L = useLookup();
  const person = id ? L.person(id) : undefined;
  if (L.me?.role === 'hr') return <HrForm person={person} />;
  if (!person) return null;
  return <EmpView p={person} />;
}

function EmpView({ p }: { p: PersonDTO }) {
  const { t, tx } = usePrefs();
  const L = useLookup();
  const { close, open } = useDrawer();
  const { data: tasks } = useTasks();
  const openTasks = (tasks ?? []).filter((k) => k.assigneeIds.includes(p.id) && !k.completedAt && canViewTask(L.me!, k));
  return (
    <>
      <div className="drawer-h">
        <h2 id="dTitle">{t('ef_view')}</h2>
        <button className="icon-btn" onClick={close} aria-label={t('close')}><Icon name="x" /></button>
      </div>
      <div className="drawer-b">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Avatar p={p} size="xl" />
          <div>
            <h3 style={{ fontSize: 18 }}>{tx(p.name)}</h3>
            <p className="muted">{tx(p.title)}</p>
          </div>
        </div>
        <dl className="kv">
          <dt>{t('col_id')}</dt><dd className="mono" dir="ltr" style={{ textAlign: 'start' }}>{p.empId}</dd>
          <dt>{t('col_dept')}</dt><dd>{tx(L.dept(p.deptId)?.name)}</dd>
          <dt>{t('col_group')}</dt><dd>{p.groupIds.map((g) => tx(L.group(g)?.name)).join(', ')}</dd>
          <dt>{t('col_role')}</dt><dd>{t('role_' + p.role)}</dd>
          <dt>{t('f_email')}</dt><dd dir="ltr" style={{ textAlign: 'start' }}>{p.email}</dd>
          <dt>{t('col_status')}</dt><dd><EmpStatus p={p} /></dd>
        </dl>
        {openTasks.length > 0 && (
          <div>
            <div className="section-t">{t('openAssigned')}</div>
            <div className="list">
              {openTasks.map((k) => (
                <button key={k.id} className="li" onClick={() => open({ type: 'task', id: k.id })}>
                  <span className="main-t"><b>{tx(k.title)}</b></span>
                  <StatusChip task={k} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

interface FormState {
  nameEn: string;
  nameAr: string;
  email: string;
  titleEn: string;
  titleAr: string;
  deptId: string;
  groupId: string;
  role: Role;
}

/** HR: add an employee, edit or transfer one, deactivate or reactivate. */
function HrForm({ person }: { person?: PersonDTO }) {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  const qc = useQueryClient();
  const toast = useToast();
  const { close } = useDrawer();
  const { data: tasks } = useTasks();
  const firstDept = [...L.depts.values()][0]?.id ?? '';
  const [f, setF] = useState<FormState>(() =>
    person
      ? { nameEn: person.name.en, nameAr: person.name.ar, email: person.email, titleEn: person.title.en, titleAr: person.title.ar, deptId: person.deptId, groupId: person.groupIds[0] ?? '', role: person.role }
      : { nameEn: '', nameAr: '', email: '', titleEn: '', titleAr: '', deptId: firstDept, groupId: [...L.groups.values()].find((g) => g.deptId === firstDept)?.id ?? '', role: 'member' },
  );
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [code, setCode] = useState<{ code: string; name: string; empId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const groups = [...L.groups.values()].filter((g) => g.deptId === f.deptId);
  const open = person ? (tasks ?? []).filter((k) => k.assigneeIds.includes(person.id) && !k.completedAt) : [];
  const head = person ? L.person(L.dept(person.deptId)?.headId) : undefined;
  const refresh = () => {
    for (const k of [keys.employees, keys.bootstrap, keys.stats, keys.activity]) qc.invalidateQueries({ queryKey: k });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (f.nameEn.trim().length < 2) e.nameEn = 'errName';
    if (f.nameAr.trim().length < 2) e.nameAr = 'errName';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'errEmail';
    if (!f.groupId) e.groupId = 'errGroup';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (person) {
        await api(`/employees/${person.id}`, { method: 'PATCH', body: f });
        toast(t('empSaved'));
        refresh();
        close();
      } else {
        const r = await api<{ person: PersonDTO; activationCode: string }>('/employees', { body: f });
        refresh();
        toast(t('empAdded', { name: tx(r.person.name) }));
        setCode({ code: r.activationCode, name: tx(r.person.name), empId: r.person.empId });
      }
    } catch (x) {
      if (x instanceof ApiError && x.code === 'invalid') setErr(x.fields);
      else toast(t(errorKey(x)), 'err');
    } finally {
      setBusy(false);
    }
  };

  const act = async (path: string, ok: string) => {
    if (!person) return;
    setBusy(true);
    try {
      await api(`/employees/${person.id}/${path}`, { method: 'POST' });
      toast(t(ok, { name: tx(person.name) }));
      setConfirmOff(false);
      refresh();
      qc.invalidateQueries({ queryKey: keys.tasks });
    } catch (x) {
      toast(t(errorKey(x)), 'err');
    } finally {
      setBusy(false);
    }
  };

  const newCode = async () => {
    if (!person) return;
    try {
      const r = await api<{ activationCode: string }>(`/employees/${person.id}/activation-code`, { method: 'POST' });
      setCode({ code: r.activationCode, name: tx(person.name), empId: person.empId });
    } catch (x) {
      toast(t(errorKey(x)), 'err');
    }
  };

  const msg = (k: string) => (err[k] ? t(err[k]) : undefined);

  if (code) {
    return (
      <>
        <div className="drawer-h">
          <h2 id="dTitle">{t('codeTitle')}</h2>
          <button className="icon-btn" onClick={close} aria-label={t('close')}><Icon name="x" /></button>
        </div>
        <div className="drawer-b">
          <div className="code-box">
            <span className="code" dir="ltr">{code.code}</span>
            <p className="muted">{t('codeBody', { name: code.name, id: code.empId })}</p>
            <div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigator.clipboard?.writeText(code.code).then(() => setCopied(true))}
              >
                <Icon name={copied ? 'check' : 'copy'} className="sm" />
                {t(copied ? 'copied' : 'copy')}
              </button>
            </div>
          </div>
        </div>
        <div className="drawer-f">
          <button className="btn btn-primary" onClick={close} data-autofocus>{t('done_')}</button>
        </div>
      </>
    );
  }

  const isSelf = person?.id === L.me?.id;
  const roleOptions = ROLES.filter((r) => r !== 'admin' || person?.role === 'admin');

  return (
    <>
      <div className="drawer-h">
        <h2 id="dTitle">{t(person ? 'ef_edit' : 'ef_new')}</h2>
        <button className="icon-btn" onClick={close} aria-label={t('close')}><Icon name="x" /></button>
      </div>
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="drawer-b">
          {person && (
            <>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <Avatar p={person} size="xl" />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 18 }}>{tx(person.name)}</h3>
                  <p className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="mono" dir="ltr">{person.empId}</span>
                    <EmpStatus p={person} />
                  </p>
                </div>
              </div>
              <dl className="kv">
                <dt>{t('joined')}</dt><dd>{fmtLong(person.joinedAt, lang)}</dd>
                {person.leftAt && (<><dt>{t('leftOn')}</dt><dd>{fmtLong(person.leftAt, lang)}</dd></>)}
                <dt>{t('openAssigned')}</dt><dd>{open.length}</dd>
              </dl>
            </>
          )}
          <div className="row2">
            <div className="field">
              <label htmlFor="efEn">{t('f_nameEn')}</label>
              <input className="input" id="efEn" dir="ltr" value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} aria-invalid={!!err.nameEn} autoFocus={!person} />
              <FieldErr msg={msg('nameEn')} />
            </div>
            <div className="field">
              <label htmlFor="efAr">{t('f_nameAr')}</label>
              <input className="input" id="efAr" dir="rtl" value={f.nameAr} onChange={(e) => set('nameAr', e.target.value)} aria-invalid={!!err.nameAr} />
              <FieldErr msg={msg('nameAr')} />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="efId">{t('empId')}</label>
              <input className="input mono" id="efId" dir="ltr" readOnly value={person?.empId ?? t('f_empIdNew')} />
              <span className="hint">{t('f_empIdHint')}</span>
            </div>
            <div className="field">
              <label htmlFor="efEmail">{t('f_email')}</label>
              <input className="input" id="efEmail" type="email" dir="ltr" value={f.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!err.email} />
              <FieldErr msg={msg('email')} />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="efJobEn">{t('f_jobEn')}</label>
              <input className="input" id="efJobEn" dir="ltr" value={f.titleEn} onChange={(e) => set('titleEn', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="efJobAr">{t('f_jobAr')}</label>
              <input className="input" id="efJobAr" dir="rtl" value={f.titleAr} onChange={(e) => set('titleAr', e.target.value)} />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="efDept">{t('f_dept')}</label>
              <select
                className="select"
                id="efDept"
                value={f.deptId}
                onChange={(e) => setF((x) => ({ ...x, deptId: e.target.value, groupId: [...L.groups.values()].find((g) => g.deptId === e.target.value)?.id ?? '' }))}
              >
                {[...L.depts.values()].map((d) => <option key={d.id} value={d.id}>{tx(d.name)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="efGroup">{t('f_group')}</label>
              <select className="select" id="efGroup" value={f.groupId} onChange={(e) => set('groupId', e.target.value)} aria-invalid={!!err.groupId}>
                {groups.map((g) => <option key={g.id} value={g.id}>{tx(g.name)}</option>)}
              </select>
              <FieldErr msg={msg('groupId')} />
            </div>
          </div>
          <div className="field" style={{ maxWidth: '50%', minWidth: 220 }}>
            <label htmlFor="efRole">{t('f_role')}</label>
            <select className="select" id="efRole" value={f.role} disabled={isSelf || person?.role === 'admin'} onChange={(e) => set('role', e.target.value as Role)}>
              {roleOptions.map((r) => <option key={r} value={r}>{t('role_' + r)}</option>)}
            </select>
          </div>

          {person && person.active && person.pendingPassword && (
            <div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={newCode}>
                <Icon name="key" className="sm" />
                {t('newCode')}
              </button>
            </div>
          )}

          {person && !isSelf && (person.active ? (
            confirmOff ? (
              <div className="confirm" role="alertdialog" aria-labelledby="cq">
                <p id="cq"><b>{t('deactivateQ', { name: tx(person.name) })}</b></p>
                <p>{t('deactivateBody')}</p>
                {open.length > 0 && <p>{t('deactivateTasks', { n: open.length, mgr: tx(head?.name) })}</p>}
                <div className="acts">
                  <button type="button" className="btn btn-danger btn-sm" disabled={busy} data-autofocus onClick={() => act('deactivate', 'deactivated')}>
                    <Icon name="userX" className="sm" />
                    {t('confirmDeactivate')}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmOff(false)}>{t('cancel')}</button>
                </div>
              </div>
            ) : (
              <div>
                <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setConfirmOff(true)}>
                  <Icon name="userX" />
                  {t('deactivate')}
                </button>
              </div>
            )
          ) : (
            <div>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => act('reactivate', 'reactivated')}>
                <Icon name="userCheck" />
                {t('reactivate')}
              </button>
            </div>
          ))}
        </div>
        <div className="drawer-f">
          <button type="button" className="btn btn-ghost" onClick={close}>{t('cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Icon name={person ? 'check' : 'userPlus'} />
            {t(person ? 'saveChanges' : 'addEmployee')}
          </button>
        </div>
      </form>
    </>
  );
}
