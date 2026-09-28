import { describe, expect, it } from 'vitest';
import { DICT, daysLabel, stepsLeftLabel, translate } from './i18n';

describe('interface text', () => {
  it('has an Arabic string for every English key', () => {
    const missing = Object.keys(DICT.en).filter((k) => !(k in DICT.ar));
    expect(missing).toEqual([]);
  });

  it('keeps the same placeholders in both languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [k, en] of Object.entries(DICT.en)) {
      const ar = (DICT.ar as Record<string, string>)[k];
      if (ar) expect(vars(ar), k).toEqual(vars(en as string));
    }
  });

  it('uses the singular form when n is 1', () => {
    expect(translate('en', 'openTasksN', { n: 1 })).toBe('1 open task');
    expect(translate('en', 'openTasksN', { n: 3 })).toBe('3 open tasks');
    expect(translate('ar', 'openTasksN', { n: 1 })).toBe('مهمة مفتوحة واحدة');
  });

  it('counts days the Arabic way', () => {
    expect(daysLabel(1, 'ar')).toBe('يوم واحد');
    expect(daysLabel(2, 'ar')).toBe('يومين');
    expect(daysLabel(5, 'ar')).toBe('5 أيام');
    expect(daysLabel(12, 'ar')).toBe('12 يومًا');
    expect(daysLabel(0, 'en')).toBe('under a day');
    expect(stepsLeftLabel(2, 'ar')).toBe('خطوتان متبقيتان');
  });
});
