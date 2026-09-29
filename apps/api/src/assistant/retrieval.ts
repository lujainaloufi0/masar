/**
 * Keyword retrieval over tasks, in Arabic and English.
 *
 * The task list a person can see is small (tens to a few hundred), so scoring every task
 * in memory is fast and needs no search index. Arabic text is normalized so that common
 * spelling variants match: diacritics, the forms of alef, taa marbuta, alef maqsura, and
 * the definite article "ال".
 */

export interface SearchDoc {
  id: string;
  title: string[];
  body: string[];
  people: string[];
  group: string[];
}

const DIACRITICS = /[ً-ٰٟـ]/g;

export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(DIACRITICS, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'for', 'to', 'and', 'or', 'in', 'on', 'at', 'is', 'are', 'my', 'me', 'our', 'what', 'which', 'who',
  'whats', 'how', 'many', 'much', 'task', 'tasks', 'with', 'by', 'about', 'any', 'do', 'does', 'did', 'this', 'that', 'it', 'there',
  'في', 'من', 'على', 'الى', 'عن', 'مع', 'ما', 'ماذا', 'هل', 'كم', 'التي', 'الذي', 'مهمه', 'مهام', 'المهمه', 'المهام', 'وش', 'ايش', 'اللي',
]);

/** Lowercased, normalized tokens. Arabic tokens lose a leading "ال" or "وال" so "الشبكة" matches "شبكة". */
export function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .map((w) => w.replace(/^(وال|بال|لل|ال)(?=\p{L}{2,})/u, ''))
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function fieldScore(queryTokens: string[], fieldTokens: Set<string>, list: string[]) {
  let s = 0;
  for (const q of queryTokens) {
    if (fieldTokens.has(q)) s += 1;
    // Prefix match catches plurals and word forms: "certificate" ↔ "certificates", "backup" ↔ "backups".
    else if (q.length >= 4 && list.some((w) => w.length >= 4 && (w.startsWith(q) || q.startsWith(w)))) s += 0.6;
  }
  return s;
}

/** Scores and sorts documents for a query. Documents that match nothing are dropped. */
export function rank<T extends SearchDoc>(docs: T[], query: string): { doc: T; score: number }[] {
  const q = [...new Set(tokens(query))];
  if (!q.length) return docs.map((doc) => ({ doc, score: 0 }));
  const scored = docs.map((doc) => {
    const f = (parts: string[]) => {
      const list = parts.flatMap(tokens);
      return fieldScore(q, new Set(list), list);
    };
    const score = 3 * f(doc.title) + 2 * f(doc.people) + 2 * f(doc.group) + f(doc.body);
    return { doc, score };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}
