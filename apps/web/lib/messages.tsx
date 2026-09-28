'use client';
import type { ActivityDTO, Bilingual, NotificationDTO } from '@masar/shared';
import type { IconName } from '@/components/Icon';
import { daysLabel, DICT, type Lang } from './i18n';
import type { useLookup } from './data';

type Lookup = ReturnType<typeof useLookup>;

const pick = (b: Bilingual | undefined | null, lang: Lang) => (b ? (lang === 'ar' ? b.ar || b.en : b.en || b.ar) : '');

/** Splits a template into text and bold names, so names render as <b> without HTML strings. */
function fill(template: string, vars: Record<string, { text: string; bold?: boolean }>) {
  const out: React.ReactNode[] = [];
  let last = 0;
  template.replace(/\{(\w+)\}/g, (m, k: string, idx: number) => {
    out.push(template.slice(last, idx));
    const v = vars[k];
    out.push(v?.bold ? <b key={idx}>{v.text}</b> : (v?.text ?? ''));
    last = idx + m.length;
    return m;
  });
  out.push(template.slice(last));
  return out;
}

export function activityText(e: ActivityDTO, lang: Lang, L: Lookup, someone: string) {
  const name = (id: string | null) => pick(L.person(id)?.name, lang) || someone;
  const tpl = DICT[lang][`ev_${e.type}` as keyof (typeof DICT)['en']] ?? DICT.en[`ev_${e.type}` as keyof (typeof DICT)['en']] ?? e.type;
  return fill(tpl, {
    actor: { text: name(e.actorId), bold: true },
    emp: { text: name(e.empId), bold: true },
    task: { text: pick(e.taskTitle, lang) },
    group: { text: pick(L.group(e.groupId)?.name, lang) },
    dept: { text: pick(L.dept(e.deptId)?.name, lang) },
  });
}

export const activityIcon = (type: string): [IconName, string] =>
  (({
    task_edited: ['edit', ''], task_cancelled: ['x', 'warn'], task_restored: ['reset', 'ok'], task_deleted: ['trash', 'danger'],
    task_created: ['plus', ''], step_done: ['check', 'ok'], step_undone: ['reset', ''], task_completed: ['completed', 'gold'], task_reopened: ['reset', 'warn'],
    emp_added: ['userPlus', 'ok'], emp_updated: ['edit', ''], emp_deactivated: ['userX', 'danger'], emp_reactivated: ['userCheck', 'ok'], first_signin: ['key', 'ok'],
    assignee_added: ['userPlus', ''], assignee_removed: ['userX', ''], group_added: ['groups', 'ok'], head_changed: ['shield', ''],
  }) as Record<string, [IconName, string]>)[type] ?? ['activity', ''];

export function notificationText(n: NotificationDTO, lang: Lang) {
  const p = n.params;
  const count = typeof p.n === 'number' ? p.n : undefined;
  const base = `n_${n.type}`;
  const dict = DICT[lang] as Record<string, string | undefined>;
  const en = DICT.en as Record<string, string | undefined>;
  const tpl = (count === 1 && (dict[base + '_1'] ?? en[base + '_1'])) || dict[base] || en[base] || n.type;
  const txt = (v: unknown) => (typeof v === 'object' && v ? pick(v as Bilingual, lang) : String(v ?? ''));
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) =>
    k === 'd' ? daysLabel(Number(p.days ?? 0), lang) : txt(p[k]),
  );
}
