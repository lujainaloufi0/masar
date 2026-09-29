'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NAV, canViewTask, type Route } from '@masar/shared';
import { api, ApiError } from '@/lib/api';
import { keys, useBootstrap, useLookup, useNotifications, useTasks } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { useRealtime } from '@/lib/realtime';
import { fmtWhen } from '@/lib/format';
import { notificationText } from '@/lib/messages';
import { Icon, type IconName } from './Icon';
import { Avatar, StatusChip } from './bits';
import { ConfettiCanvas, ToastProvider, useToast } from './fx';
import { HoldFill, forgetProgress } from './Progress';
import { DrawerCtx, useDrawer, type DrawerState } from './drawer-ctx';
import { DrawerLayer } from './drawers/DrawerLayer';

const NAV_ICON: Record<Route, IconName> = {
  overview: 'overview', tasks: 'tasks', groups: 'groups', completed: 'completed', employees: 'employees', departments: 'departments', activity: 'activity',
};

export interface DemoAccount {
  empId: string;
  name: { en: string; ar: string };
  role: 'admin' | 'hr' | 'manager' | 'member';
  dept: { en: string; ar: string };
  note: 'newHire' | null;
  pending: boolean;
}

export function useDemo() {
  // On free hosting the API may be asleep and take up to a minute to wake, so keep retrying.
  const wake = { retry: 15, retryDelay: 4000 } as const;
  const cfg = useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<{ demoMode: boolean; demoPassword?: string; demoCode?: string }>('/auth/config'),
    staleTime: Infinity,
    ...wake,
  });
  const accounts = useQuery({
    queryKey: ['demo-accounts'],
    queryFn: () => api<DemoAccount[]>('/auth/demo-accounts'),
    enabled: !!cfg.data?.demoMode,
    staleTime: 5 * 60_000,
    ...wake,
  });
  return {
    demoMode: !!cfg.data?.demoMode,
    demoPassword: cfg.data?.demoPassword,
    demoCode: cfg.data?.demoCode,
    accounts: accounts.data ?? [],
    /** True while the server is still starting up. */
    waking: !cfg.data || (!!cfg.data.demoMode && !accounts.data),
  };
}

export function Brand() {
  const { lang } = usePrefs();
  return (
    <div className="brand">
      <span className="mark"><Icon name="path" /></span>
      <span>{lang === 'ar' ? 'مسار' : 'Masar'}</span>
      <span className="ar">{lang === 'ar' ? 'Masar' : 'مسار'}</span>
    </div>
  );
}

export function LangButton() {
  const { t, lang, setLang } = usePrefs();
  return (
    <button className="lang-btn" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label={t('langLabel')} lang={lang === 'ar' ? 'en' : 'ar'}>
      <Icon name="lang" />
      <span className="l">{t('langSwitch')}</span>
    </button>
  );
}

export function ThemeButton() {
  const { t, theme, toggleTheme } = usePrefs();
  const dark = theme === 'dark';
  return (
    <button className="icon-btn" onClick={toggleTheme} aria-label={t(dark ? 'toLight' : 'toDark')} title={t(dark ? 'toLight' : 'toDark')}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ShellInner>{children}</ShellInner>
    </ToastProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = usePrefs();
  const boot = useBootstrap();
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const lastFocus = useRef<HTMLElement | null>(null);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    qc.clear();
    forgetProgress();
    router.replace('/login');
  }, [qc, router]);

  const onReset = useCallback(() => {
    forgetProgress();
    setDrawer(null);
    qc.invalidateQueries();
    toast(t('demoReset'));
  }, [qc, toast, t]);

  useEffect(() => {
    if (boot.error instanceof ApiError && boot.error.status === 401) signOut();
  }, [boot.error, signOut]);

  const connected = useRealtime(!!boot.data, { onSignedOut: signOut, onReset });

  const route = (pathname.split('/')[1] || 'overview') as Route;
  const role = boot.data?.me.role;
  useEffect(() => {
    if (role && !NAV[role].includes(route)) router.replace('/overview');
  }, [role, route, router]);

  // Deep links such as /tasks?task=<id> open the drawer.
  useEffect(() => {
    const id = params.get('task');
    if (id) setDrawer({ type: 'task', id });
  }, [params]);

  const api_ = useMemo(
    () => ({
      drawer,
      open: (d: Exclude<DrawerState, null>) => {
        if (!drawer) lastFocus.current = document.activeElement as HTMLElement;
        setDrawer(d);
        setSideOpen(false);
      },
      close: () => {
        setDrawer(null);
        if (params.get('task')) router.replace(pathname, { scroll: false });
        const el = lastFocus.current;
        if (el && document.contains(el)) setTimeout(() => el.focus(), 0);
      },
    }),
    [drawer, params, pathname, router],
  );

  useEffect(() => {
    const onScroll = () => document.getElementById('top')?.classList.toggle('scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!boot.data) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }} aria-busy="true">
        {boot.error && !(boot.error instanceof ApiError && boot.error.status === 401) ? (
          <div className="empty">
            <Icon name="alert" />
            <p>{t('errNetwork')}</p>
            <button className="btn btn-ghost btn-sm" onClick={() => boot.refetch()}>{t('back')}</button>
          </div>
        ) : (
          <span className="faint">{t('loading')}</span>
        )}
      </div>
    );
  }

  return (
    <DrawerCtx.Provider value={api_}>
      <HoldFill.Provider value={!!drawer}>
        <a href="#view" className="sr" onFocus={(e) => e.currentTarget.classList.remove('sr')} onBlur={(e) => e.currentTarget.classList.add('sr')}>
          {t('skip')}
        </a>
        <div className="app">
          <aside className={`side ${sideOpen ? 'open' : ''}`} id="side">
            <Sidebar route={route} connected={connected} onNavigate={() => setSideOpen(false)} />
          </aside>
          <div className={`side-scrim ${sideOpen ? 'open' : ''}`} onClick={() => setSideOpen(false)} />
          <div className="main">
            <header className="top" id="top">
              <Topbar onMenu={() => setSideOpen((v) => !v)} onSignOut={signOut} />
            </header>
            <motion.main
              key={pathname}
              className="content"
              id="view"
              tabIndex={-1}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.main>
          </div>
        </div>
        <DrawerLayer />
        <ConfettiCanvas />
      </HoldFill.Provider>
    </DrawerCtx.Provider>
  );
}

function Sidebar({ route, connected, onNavigate }: { route: Route; connected: boolean; onNavigate: () => void }) {
  const { t, tx } = usePrefs();
  const L = useLookup();
  const { data: tasks } = useTasks();
  const { demoMode } = useDemo();
  const me = L.me!;
  const open = (tasks ?? []).filter((x) => !x.completedAt && (me.role === 'member' ? x.assigneeIds.includes(me.id) : x.deptId === me.deptId)).length;
  return (
    <>
      <Brand />
      <div className="org-chip">
        <span className="emb"><Icon name="building" /></span>
        <div>
          <b>{tx(L.boot?.org.name)}</b>
          <span>{tx(L.dept(me.deptId)?.name)}</span>
        </div>
      </div>
      <nav className="nav" aria-label={t('workspace')}>
        <span className="nav-label">{t('workspace')}</span>
        {NAV[me.role].map((r) => (
          <Link key={r} href={`/${r}`} aria-current={route === r ? 'page' : undefined} onClick={onNavigate}>
            <Icon name={NAV_ICON[r]} />
            <span>{t(r === 'tasks' ? (me.role === 'member' ? 'nav_mytasks' : 'nav_tasks') : `nav_${r}`)}</span>
            {r === 'tasks' && open > 0 && <span className="count">{open}</span>}
          </Link>
        ))}
      </nav>
      <div className="side-foot">
        <span className={`live ${connected ? 'on' : ''}`} role="status">
          <i aria-hidden="true" />
          {t(connected ? 'live' : 'offline')}
        </span>
        {demoMode && <div className="proto-note">{t('demoNote')}</div>}
      </div>
    </>
  );
}

function Topbar({ onMenu, onSignOut }: { onMenu: () => void; onSignOut: () => void }) {
  const { t, tx, lang } = usePrefs();
  const L = useLookup();
  const me = L.me!;
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const { open } = useDrawer();
  const { data: notes } = useNotifications();
  const { data: tasks } = useTasks();
  const { demoMode, accounts } = useDemo();
  const [pop, setPop] = useState<null | 'notes' | 'me'>(null);
  const [q, setQ] = useState('');
  const closePop = useCallback(() => setPop(null), []);
  const notesRef = useDismiss(pop === 'notes', closePop);
  const meRef = useDismiss(pop === 'me', closePop);
  const searchRef = useDismiss(!!q, () => setQ(''));
  const unread = (notes ?? []).filter((n) => !n.read).length;
  const meP = L.person(me.id);

  const ql = q.trim().toLowerCase();
  const taskHits = ql ? (tasks ?? []).filter((x) => canViewTask(me, x) && (x.title.en.toLowerCase().includes(ql) || x.title.ar.includes(q.trim()))).slice(0, 5) : [];
  const peopleHits = ql
    ? L.allPeople.filter((p) => (me.role !== 'member' || p.deptId === me.deptId) && (p.name.en.toLowerCase().includes(ql) || p.name.ar.includes(q.trim()) || p.empId.toLowerCase().includes(ql))).slice(0, 5)
    : [];

  const markAll = async () => {
    await api('/notifications/read', { method: 'POST' });
    qc.invalidateQueries({ queryKey: keys.notifications });
  };

  const switchTo = async (empId: string) => {
    setPop(null);
    try {
      const r = await api<{ status: string }>('/auth/demo', { body: { empId } });
      if (r.status !== 'ok') return;
      qc.clear();
      forgetProgress();
      router.replace('/overview');
      qc.invalidateQueries();
    } catch {
      toast(t('errGeneric'), 'err');
    }
  };

  return (
    <>
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label={t('menu')}>
        <Icon name="menu" />
      </button>
      <div className="search" ref={searchRef}>
        <Icon name="search" />
        <input
          type="search"
          autoComplete="off"
          placeholder={t('searchPh')}
          aria-label={t('searchPh')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        />
        {ql && (
          <div className="results">
            {taskHits.length > 0 && <div className="grp">{t('res_tasks')}</div>}
            {taskHits.map((x) => (
              <button key={x.id} onClick={() => { setQ(''); open({ type: 'task', id: x.id }); }}>
                <Icon name="tasks" className="sm" />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx(x.title)}</span>
                <StatusChip task={x} />
              </button>
            ))}
            {peopleHits.length > 0 && <div className="grp">{t('res_people')}</div>}
            {peopleHits.map((p) => (
              <button key={p.id} onClick={() => { setQ(''); open({ type: 'emp', id: p.id }); }}>
                <Avatar p={p} />
                <span style={{ flex: 1 }}>{tx(p.name)}</span>
                <span className="mono faint" dir="ltr">{p.empId}</span>
              </button>
            ))}
            {!taskHits.length && !peopleHits.length && <div className="none">{t('noResults', { q: q.trim() })}</div>}
          </div>
        )}
      </div>
      <div className="top-actions">
        <LangButton />
        <ThemeButton />
        <div className="rel" ref={notesRef}>
          <button className="icon-btn" onClick={() => setPop(pop === 'notes' ? null : 'notes')} aria-label={t('notifications')} aria-expanded={pop === 'notes'}>
            <Icon name="bell" />
            {unread > 0 && <span className="dot" />}
          </button>
          {pop === 'notes' && (
            <motion.div className="pop" role="dialog" aria-label={t('notifications')} initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>{t('notifications')}</h3>
                {unread > 0 && <button className="btn btn-quiet btn-sm" onClick={markAll}>{t('markRead')}</button>}
              </div>
              {(notes ?? []).length ? (
                notes!.map((n) => (
                  <button
                    key={n.id}
                    className="item"
                    onClick={async () => {
                      setPop(null);
                      if (!n.read) api(`/notifications/${n.id}/read`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: keys.notifications }));
                      if (n.taskId) open({ type: 'task', id: n.taskId });
                    }}
                  >
                    {n.read ? <span style={{ width: 7, flex: 'none' }} /> : <span className="unread" />}
                    <span>
                      <p>{notificationText(n, lang)}</p>
                      <time>{fmtWhen(n.at, lang, t)}</time>
                    </span>
                  </button>
                ))
              ) : (
                <p className="faint" style={{ padding: 10 }}>{t('noNotes')}</p>
              )}
            </motion.div>
          )}
        </div>
        <div className="rel" ref={meRef}>
          <button className="me" onClick={() => setPop(pop === 'me' ? null : 'me')} aria-expanded={pop === 'me'} aria-label={tx(me.name)}>
            <Avatar p={meP} />
            <span className="who">
              <b>{tx(me.name)}</b>
              <span>{t('role_' + me.role)}</span>
            </span>
            <Icon name="chevD" className="sm" />
          </button>
          {pop === 'me' && (
            <motion.div className="pop" role="dialog" aria-label={tx(me.name)} initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10 }}>
                <Avatar p={meP} size="lg" />
                <div>
                  <b style={{ fontWeight: 600 }}>{tx(me.name)}</b>
                  <div className="faint" style={{ fontSize: 12.5 }}>{tx(me.title)}</div>
                  <div className="mono faint" dir="ltr" style={{ textAlign: 'start' }}>{me.empId}</div>
                </div>
              </div>
              {demoMode && accounts.length > 0 && (
                <>
                  <div className="sep" />
                  <h3 style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 500, padding: '6px 10px' }}>{t('viewAs')}</h3>
                  {accounts.filter((a) => !a.pending).map((a) => (
                    <button key={a.empId} className="role-pick" aria-current={a.empId === me.empId} onClick={() => a.empId !== me.empId && switchTo(a.empId)}>
                      <Avatar p={L.allPeople.find((p) => p.empId === a.empId) ?? ({ ...a, id: a.empId, active: true } as never)} />
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{tx(a.name)}</span>
                        <span className="faint" style={{ fontSize: 12 }}>{t('role_' + a.role)}</span>
                      </span>
                      {a.empId === me.empId && <Icon name="check" className="sm" />}
                    </button>
                  ))}
                </>
              )}
              <div className="sep" />
              <button className="role-pick" onClick={onSignOut}>
                <Icon name="logout" className="flip" />
                <span>{t('signOut')}</span>
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
}
