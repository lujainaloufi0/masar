'use client';
import type { PersonDTO, TaskDTO } from '@masar/shared';
import { taskStatus } from '@masar/shared';
import { usePrefs } from '@/lib/prefs';
import { daysLabel } from '@/lib/i18n';
import { dayDiff, fmtDate, todayISO } from '@/lib/format';
import { Icon, type IconName } from './Icon';

const AV_COLORS = ['#2E7D68', '#7A68A6', '#AD7B2A', '#4B79A8', '#A0566E', '#5E6B66', '#3E8E7E', '#8C6D4F', '#50709A'];

export function Avatar({ p, size = '' }: { p?: PersonDTO; size?: '' | 'lg' | 'xl' }) {
  const { lang, tx } = usePrefs();
  if (!p) return <span className={`av ${size}`} style={{ background: 'var(--surface-3)' }} aria-hidden="true" />;
  const parts = tx(p.name).split(' ').filter(Boolean);
  const strip = (s: string) => (lang === 'ar' ? s.replace(/^ال/, '') : s.replace(/^Al-/, ''));
  const ini = (parts[0]?.[0] ?? '') + (parts.length > 1 ? strip(parts[parts.length - 1])[0] ?? '' : '');
  const c = AV_COLORS[[...p.empId].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV_COLORS.length];
  return (
    <span className={`av ${size} ${p.active ? '' : 'off'}`} style={{ background: c }} title={tx(p.name)}>
      {ini}
    </span>
  );
}

export function Avatars({ ids, person, max = 4 }: { ids: string[]; person: (id: string) => PersonDTO | undefined; max?: number }) {
  return (
    <span className="avs">
      {ids.slice(0, max).map((id) => (
        <Avatar key={id} p={person(id)} />
      ))}
      {ids.length > max && (
        <span className="av" style={{ background: 'var(--surface-3)', color: 'var(--ink-2)' }}>
          +{ids.length - max}
        </span>
      )}
    </span>
  );
}

export function useDL() {
  const { lang } = usePrefs();
  return (n: number) => daysLabel(n, lang);
}

export function StatusChip({ task, id, className = '' }: { task: TaskDTO; id?: string; className?: string }) {
  const { t } = usePrefs();
  const s = taskStatus(task, todayISO());
  return (
    <span id={id} className={`chip ${className} ${s === 'done' ? 'gold' : s === 'doing' ? 'ok' : s === 'cancelled' ? 'warn' : s === 'scheduled' ? 'line' : ''}`}>
      {t(s)}
    </span>
  );
}

export function DueInfo({ task }: { task: TaskDTO }) {
  const { t, lang } = usePrefs();
  const DL = useDL();
  if (task.completedAt)
    return (
      <span className="due">
        <Icon name="check" className="sm" />
        {fmtDate(task.completedAt, lang)}
      </span>
    );
  if (task.startDate > todayISO())
    return <span className="due"><Icon name="hourglass" className="sm" />{t('startsOn', { date: fmtDate(task.startDate, lang) })}</span>;
  const d = dayDiff(todayISO(), task.dueDate);
  if (d < 0) return <span className="due late"><Icon name="clock" className="sm" />{t('overdue', { d: DL(-d) })}</span>;
  if (d === 0) return <span className="due soon"><Icon name="clock" className="sm" />{t('dueToday')}</span>;
  if (d === 1) return <span className="due soon"><Icon name="clock" className="sm" />{t('dueTomorrow')}</span>;
  if (d <= 3) return <span className="due soon"><Icon name="clock" className="sm" />{t('dueIn', { d: DL(d) })}</span>;
  return <span className="due"><Icon name="calendar" className="sm" />{t('dueOn', { date: fmtDate(task.dueDate, lang) })}</span>;
}

export function PageHead({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

export function Empty({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <p>{children}</p>
    </div>
  );
}

export function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="err" role="alert">
      <Icon name="alert" className="sm" />
      {msg}
    </span>
  );
}

export function Skeleton({ h = 120 }: { h?: number }) {
  return <div className="skel" style={{ height: h }} aria-hidden="true" />;
}
