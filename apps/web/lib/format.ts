import type { Lang } from './i18n';

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in the viewer's time zone. Accepts ISO timestamps and plain dates. */
export function localDay(v: string | Date): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = typeof v === 'string' ? new Date(v) : v;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayISO = () => localDay(new Date());

/** Whole days from a to b. */
export function dayDiff(a: string, b: string) {
  const [x, y] = [localDay(a), localDay(b)].map((s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
  return Math.round((y - x) / 864e5);
}

const loc = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB');

export function fmtDate(v: string, lang: Lang, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat(loc(lang), o).format(new Date(localDay(v) + 'T12:00:00'));
}

export const fmtLong = (v: string, lang: Lang) => fmtDate(v, lang, { day: 'numeric', month: 'long', year: 'numeric' });

export function fmtTime(v: string, lang: Lang) {
  return new Intl.DateTimeFormat(loc(lang), { hour: 'numeric', minute: '2-digit' }).format(new Date(v));
}

export function fmtWhen(v: string, lang: Lang, t: (k: 'today' | 'yesterday') => string) {
  const d = dayDiff(v, todayISO());
  const day = d === 0 ? t('today') : d === 1 ? t('yesterday') : fmtDate(v, lang);
  return v.length > 10 ? `${day}, ${fmtTime(v, lang)}` : day;
}

export function hijri(lang: Lang) {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch {
    return '';
  }
}

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Slow, visible fill: a longer distance takes longer, from 0.9 s up to 3 s. */
export const fillMs = (d: number) => (reducedMotion() ? 150 : Math.min(3000, 900 + 2400 * Math.abs(d)));
