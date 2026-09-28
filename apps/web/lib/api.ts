/** Thin wrapper over fetch. Every request goes to this origin; Next forwards /api to the API. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public fields: Record<string, string> = {},
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'errNetwork');
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const code =
      res.status === 429 ? 'errTooMany'
      : typeof data?.code === 'string' ? data.code
      : res.status === 403 ? 'forbidden'
      : res.status === 404 ? 'notFound'
      : 'errGeneric';
    throw new ApiError(res.status, code, data?.fields ?? {});
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** Maps an API error to an interface text key. */
export function errorKey(e: unknown): string {
  if (!(e instanceof ApiError)) return 'errGeneric';
  if (e.code === 'forbidden') return 'errForbidden';
  if (e.code === 'notFound') return 'errNotFound';
  if (e.code === 'invalid') return Object.values(e.fields)[0] ?? 'errGeneric';
  return e.code;
}
