const DAY_MS = 86_400_000;

/** Completed steps ÷ total steps, between 0 and 1. A task with no steps has no progress. */
export function progress(steps: ReadonlyArray<{ done: boolean }>): number {
  if (!steps.length) return 0;
  return steps.filter((s) => s.done).length / steps.length;
}

function toUtcDay(d: Date | string): number {
  const x = typeof d === 'string' ? new Date(d) : d;
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

/** Whole calendar days from `a` to `b` (negative when `b` is earlier). */
export function dayDiff(a: Date | string, b: Date | string): number {
  return Math.round((toUtcDay(b) - toUtcDay(a)) / DAY_MS);
}

/** Days from creation to completion, never negative. */
export function daysTaken(createdAt: Date | string, completedAt: Date | string): number {
  return Math.max(0, dayDiff(createdAt, completedAt));
}

export function taskStatus(t: { cancelledAt: unknown; completedAt: unknown; steps: ReadonlyArray<{ done: boolean }> }) {
  if (t.cancelledAt) return 'cancelled' as const;
  if (t.completedAt) return 'done' as const;
  return progress(t.steps) > 0 ? ('doing' as const) : ('todo' as const);
}
