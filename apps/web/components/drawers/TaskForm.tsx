'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { TaskDTO } from '@masar/shared';
import { api, ApiError, errorKey, uploadFile } from '@/lib/api';
import { putTask, useLookup, useTask } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { localDay, todayISO } from '@/lib/format';
import { Icon } from '../Icon';
import { Avatar, FieldErr } from '../bits';
import { AttachButton, DropZone, MAX_FILE_BYTES, StagedFiles } from './TaskFiles';
import { useToast } from '../fx';
import { useDrawer } from '../drawer-ctx';

interface StepRow {
  key: number;
  id: string | null;
  text: string;
  done: boolean;
  /** files picked for this step, uploaded after saving */
  files: File[];
}

const inAWeek = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return localDay(d);
};

/** Create a task, or edit one (title, details, group, due date, assignees, steps). */
export function TaskForm({ editId }: { editId?: string }) {
  const { data: task } = useTask(editId ?? null);
  if (editId && !task) return null;
  return <Form task={task} />;
}

function Form({ task }: { task?: TaskDTO }) {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const qc = useQueryClient();
  const toast = useToast();
  const { open, close } = useDrawer();
  const deptId = task?.deptId ?? me.deptId;
  const groups = [...L.groups.values()].filter((g) => g.deptId === deptId);
  const seq = useRef(0);
  const row = (s: Partial<StepRow> = {}): StepRow => ({ key: ++seq.current, id: null, text: '', done: false, files: [], ...s });

  const [title, setTitle] = useState(task ? tx(task.title) : '');
  const [desc, setDesc] = useState(task ? tx(task.desc) : '');
  const [groupId, setGroupId] = useState(task?.groupId ?? groups[0]?.id ?? '');
  const [start, setStart] = useState(task?.startDate ?? todayISO());
  const [due, setDue] = useState(task?.dueDate ?? inAWeek());
  const [assignees, setAssignees] = useState<string[]>(task?.assigneeIds ?? []);
  const [steps, setSteps] = useState<StepRow[]>(() =>
    task ? task.steps.map((s) => row({ id: s.id, text: tx(s.text), done: s.done })) : [row(), row(), row()],
  );
  const [err, setErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Files picked in the form (for the task, or for one step). They're uploaded right after the task is saved.
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const fit = (list: File[]) => {
    const ok = list.filter((f) => f.size <= MAX_FILE_BYTES);
    for (const f of list) if (f.size > MAX_FILE_BYTES) toast(t('errFileTooBigNamed', { name: f.name }), 'err');
    return ok;
  };
  const addFiles = (list: File[]) => setFiles((cur) => [...cur, ...fit(list)].slice(0, 20));
  const addStepFiles = (key: number, list: File[]) =>
    setSteps((l) => l.map((x) => (x.key === key ? { ...x, files: [...x.files, ...fit(list)].slice(0, 10) } : x)));
  const form = useRef<HTMLFormElement>(null);

  const members = L.allPeople.filter(
    (x) => (x.active && x.deptId === deptId && x.groupIds.includes(groupId) && x.id !== me.id) || assignees.includes(x.id),
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'errTitle';
    if (!start) e.start = 'errStart';
    else if (!task && start < todayISO()) e.start = 'errStartPast';
    if (!due) e.due = 'errDue';
    else if (!task && due < todayISO()) e.due = 'errDuePast';
    else if (start && due < start) e.due = 'errDueBeforeStart';
    if (!assignees.length) e.as = 'errAssignee';
    if (!steps.some((s) => s.text.trim())) e.steps = 'errSteps';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErr(e);
    if (Object.keys(e).length) {
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-err="true"] input')?.focus();
      return;
    }
    setSaving(true);
    const body = {
      groupId, title, desc, startDate: start, dueDate: due, assigneeIds: assignees, lang,
      steps: steps.filter((s) => s.text.trim()).map((s) => ({ id: s.id, text: s.text })),
    };
    try {
      const r = task ? await api<TaskDTO>(`/tasks/${task.id}`, { method: 'PATCH', body }) : await api<TaskDTO>('/tasks', { body });
      putTask(qc, r);
      // Steps come back in the order they were sent, so the i-th kept row is the i-th saved step.
      const kept = steps.filter((x) => x.text.trim());
      const queue: [File, string | undefined][] = [
        ...files.map((f): [File, undefined] => [f, undefined]),
        ...kept.flatMap((x, i) => x.files.map((f): [File, string | undefined] => [f, r.steps[i]?.id])),
      ];
      for (const [f, stepId] of queue) {
        setUploading(f.name);
        try {
          await uploadFile(`/tasks/${r.id}/attachments`, f, stepId ? { stepId } : {});
        } catch (e) {
          toast(`${f.name}: ${t(errorKey(e))}`, 'err');
        }
      }
      setUploading(null);
      if (queue.length) qc.invalidateQueries({ queryKey: ['attachments', r.id] });
      if (task) {
        toast(t('toastSaved'));
        open({ type: 'task', id: r.id });
      } else {
        toast(t('createdToast'));
        close();
      }
    } catch (x) {
      if (x instanceof ApiError && x.code === 'invalid') {
        const f = x.fields;
        setErr({ title: f.title, start: f.startDate, due: f.dueDate, as: f.assigneeIds, steps: f.steps, group: f.groupId });
      } else toast(t(errorKey(x)), 'err');
    } finally {
      setSaving(false);
    }
  };

  const msg = (k: string) => (err[k] ? t(err[k]) : undefined);

  return (
    <>
      <div className="drawer-h">
        <h2 id="dTitle">{t(task ? 'et_title' : 'nt_title')}</h2>
        <button className="icon-btn" onClick={close} aria-label={t('close')}><Icon name="x" /></button>
      </div>
      <form ref={form} onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="drawer-b">
          <div className="field">
            <label htmlFor="ntTitle">{t('f_title')}</label>
            <input className="input" id="ntTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('f_titlePh')} aria-invalid={!!err.title} autoFocus maxLength={200} />
            <FieldErr msg={msg('title')} />
          </div>
          <div className="field">
            <label htmlFor="ntDesc">
              {t('f_desc')} <span className="faint" style={{ fontWeight: 400 }}>({t('f_optional')})</span>
            </label>
            <textarea className="textarea" id="ntDesc" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={4000} />
          </div>
          <div className="field">
              <label htmlFor="ntGroup">{t('f_group')}</label>
              <select
                className="select"
                id="ntGroup"
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  if (!task) setAssignees([]);
                }}
              >
                {groups.map((g) => <option key={g.id} value={g.id}>{tx(g.name)}</option>)}
              </select>
              <FieldErr msg={msg('group')} />
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="ntStart">{t('f_start')}</label>
              <input className="input" type="date" id="ntStart" value={start} min={task ? undefined : todayISO()} onChange={(e) => setStart(e.target.value)} aria-invalid={!!err.start} />
              {err.start ? <FieldErr msg={msg('start')} /> : <span className="hint">{t('f_startHint')}</span>}
            </div>
            <div className="field">
              <label htmlFor="ntDue">{t('f_due')}</label>
              <input className="input" type="date" id="ntDue" value={due} min={start || (task ? undefined : todayISO())} onChange={(e) => setDue(e.target.value)} aria-invalid={!!err.due} />
              <FieldErr msg={msg('due')} />
            </div>
          </div>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }} data-err={!!err.as}>
            <legend className="lbl" style={{ padding: 0, marginBottom: 6 }}>{t('f_assignees')}</legend>
            <div className="pick">
              {members.map((x) => (
                <label key={x.id}>
                  <Avatar p={x} />
                  <input
                    type="checkbox"
                    checked={assignees.includes(x.id)}
                    onChange={(e) => setAssignees((a) => (e.target.checked ? [...a, x.id] : a.filter((y) => y !== x.id)))}
                  />
                  {tx(x.name)}
                </label>
              ))}
            </div>
            {err.as ? <FieldErr msg={msg('as')} /> : <span className="hint">{t('f_assigneesHint')}</span>}
          </fieldset>
          <div className="field" data-err={!!err.steps}>
            <span className="lbl">{t('f_steps')}</span>
            <div className="step-edit">
              {steps.map((s, i) => (
                <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="row">
                  <span className="n">
                    {s.done ? <span style={{ color: 'var(--accent)' }} title={t('stepDoneMark')}><Icon name="check" className="sm" /></span> : i + 1}
                  </span>
                  <input
                    className="input"
                    value={s.text}
                    maxLength={300}
                    placeholder={t('f_stepPh', { n: i + 1 })}
                    aria-label={t('f_stepPh', { n: i + 1 })}
                    onChange={(e) => setSteps((l) => l.map((x) => (x.key === s.key ? { ...x, text: e.target.value } : x)))}
                  />
                  <AttachButton label={t('attachToStep', { step: s.text || t('f_stepPh', { n: i + 1 }) })} onFiles={(fs) => addStepFiles(s.key, fs)} />
                  {steps.length > 1 && (
                    <button type="button" className="icon-btn" onClick={() => setSteps((l) => l.filter((x) => x.key !== s.key))} aria-label={t('removeStep', { n: i + 1 })}>
                      <Icon name="trash" className="sm" />
                    </button>
                  )}
                </div>
                <StagedFiles
                  files={s.files}
                  onRemove={(j) => setSteps((l) => l.map((x) => (x.key === s.key ? { ...x, files: x.files.filter((_, k) => k !== j) } : x)))}
                />
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                setSteps((l) => [...l, row()]);
                setTimeout(() => {
                  const ins = form.current?.querySelectorAll<HTMLInputElement>('.step-edit input');
                  ins?.[ins.length - 1]?.focus();
                }, 0);
              }}
            >
              <Icon name="plus" className="sm" />
              {t('addStep')}
            </button>
            {err.steps ? <FieldErr msg={msg('steps')} /> : <span className="hint">{t('f_stepsHint')}</span>}
          </div>
          <div className="field">
            <span className="lbl">
              {t('f_files')} <span className="faint" style={{ fontWeight: 400 }}>({t('f_optional')})</span>
            </span>
            <DropZone compact onFiles={addFiles} />
            <StagedFiles files={files} onRemove={(i) => setFiles((l) => l.filter((_, j) => j !== i))} />
            <span className="hint">{t('f_filesHint')}</span>
          </div>
        </div>
        <div className="drawer-f">
          <button type="button" className="btn btn-ghost" onClick={() => (task ? open({ type: 'task', id: task.id }) : close())}>{t('cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Icon name={task ? 'check' : 'plus'} />
            {uploading ? t('uploading', { name: uploading }) : t(task ? 'saveChanges' : 'createTask')}
          </button>
        </div>
      </form>
    </>
  );
}
