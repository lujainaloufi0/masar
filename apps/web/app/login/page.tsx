'use client';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { Bilingual } from '@masar/shared';
import { api, ApiError, errorKey } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';
import { Icon } from '@/components/Icon';
import { Avatar, FieldErr } from '@/components/bits';
import { Brand, LangButton, ThemeButton, useDemo } from '@/components/Shell';
import { forgetProgress } from '@/components/Progress';

type LoginResult = { status: 'ok' } | { status: 'setup'; setupToken: string; name: Bilingual };

function Pattern() {
  return (
    <svg className="pattern" aria-hidden="true">
      <defs>
        <pattern id="khatam" width="96" height="96" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#8FE0BA" strokeOpacity=".16" strokeWidth="1">
            <rect x="28" y="28" width="40" height="40" />
            <rect x="28" y="28" width="40" height="40" transform="rotate(45 48 48)" />
            <circle cx="48" cy="48" r="9" />
            <path d="M0 48h20M76 48h20M48 0v20M48 76v20" />
            <rect x="-20" y="-20" width="40" height="40" transform="rotate(45 0 0)" />
            <rect x="76" y="-20" width="40" height="40" transform="rotate(45 96 0)" />
            <rect x="-20" y="76" width="40" height="40" transform="rotate(45 0 96)" />
            <rect x="76" y="76" width="40" height="40" transform="rotate(45 96 96)" />
          </g>
        </pattern>
        <radialGradient id="fadeG" cx="20%" cy="100%" r="90%">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="fadeM"><rect width="100%" height="100%" fill="url(#fadeG)" /></mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#khatam)" mask="url(#fadeM)" />
    </svg>
  );
}

export default function LoginPage() {
  const { t, tx } = usePrefs();
  const router = useRouter();
  const qc = useQueryClient();
  const { demoMode, accounts, demoPassword, demoCode, waking } = useDemo();
  const [empId, setEmpId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<{ id?: string; pw?: string; form?: string }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ token: string; name: Bilingual } | null>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  const enter = () => {
    qc.clear();
    forgetProgress();
    router.replace('/overview');
  };

  const handle = (r: LoginResult) => {
    if (r.status === 'ok') enter();
    else setSetup({ token: r.setupToken, name: r.name });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof err = {};
    if (!empId.trim()) next.id = t('errEmpId');
    else if (!pw) next.pw = t('errPw');
    setErr(next);
    if (next.id) return idRef.current?.focus();
    if (next.pw) return pwRef.current?.focus();
    setBusy('form');
    try {
      handle(await api<LoginResult>('/auth/login', { body: { empId, password: pw } }));
    } catch (x) {
      setErr({ form: t(errorKey(x)) });
      pwRef.current?.select();
    } finally {
      setBusy(null);
    }
  };

  const demo = async (id: string) => {
    setBusy(id);
    try {
      handle(await api<LoginResult>('/auth/demo', { body: { empId: id } }));
    } catch (x) {
      setErr({ form: t(errorKey(x)) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="login">
      <section className="login-form-side">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Brand />
          <div style={{ display: 'flex', gap: 4 }}>
            <LangButton />
            <ThemeButton />
          </div>
        </div>

        {setup ? (
          <SetPassword token={setup.token} name={tx(setup.name).split(' ')[0]} onDone={enter} onBack={() => setSetup(null)} />
        ) : (
          <div className="login-card">
            <div>
              <h1>{t('signInTitle')}</h1>
              <p className="muted" style={{ marginTop: 8 }}>{t('tagline')}</p>
            </div>
            <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="field">
                <label htmlFor="lid">{t('empId')}</label>
                <input ref={idRef} className="input" id="lid" autoComplete="username" dir="ltr" placeholder="WDA-10482" value={empId} onChange={(e) => setEmpId(e.target.value)} aria-invalid={!!err.id} />
                <FieldErr msg={err.id} />
              </div>
              <div className="field">
                <label htmlFor="lpw">{t('passwordOrCode')}</label>
                <input ref={pwRef} className="input" id="lpw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!err.pw} />
                <FieldErr msg={err.pw} />
              </div>
              {err.form && <p className="form-err" role="alert"><Icon name="alert" className="sm" />{err.form}</p>}
              <button className="btn btn-primary" type="submit" disabled={busy === 'form'}>
                <Icon name="login" className="flip" />
                {t('signIn')}
              </button>
            </form>
            <p className="faint" style={{ fontSize: 13 }}>{t('firstTime')}</p>
            {waking && (
              <p className="code-note" role="status">{t('waking')}</p>
            )}
            {demoMode && accounts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="demo-head">
                  <h2>{t('demoAccounts')}</h2>
                  <span className="faint" style={{ fontSize: 12.5 }}>{t('demoHint')}</span>
                </div>
                <div className="demo-list">
                  {accounts.map((a) => (
                    <button key={a.empId} type="button" disabled={!!busy} onClick={() => demo(a.empId)}>
                      <Avatar p={{ ...a, id: a.empId, title: a.name, deptId: '', groupIds: [], email: '', active: true, pendingPassword: a.pending, joinedAt: '', leftAt: null }} />
                      <span className="who">
                        <b>{tx(a.name)}</b>
                        <span>{a.note ? t(a.note) : `${t('role_' + a.role)}, ${tx(a.dept)}`}</span>
                      </span>
                      <span className="mono faint" dir="ltr">{a.empId}</span>
                    </button>
                  ))}
                </div>
                {demoPassword && <p className="code-note">{t('demoPw', { pw: demoPassword, code: demoCode })}</p>}
              </div>
            )}
          </div>
        )}

        <div className="login-foot">
          <span>{t('quoteSmall')}</span>
          {demoMode && <span>{t('demoNote')}</span>}
        </div>
      </section>
      <aside className="login-art">
        <Pattern />
        <p className="quote">
          {t('quote')}
          <small>{t('quoteSmall')}</small>
        </p>
      </aside>
    </div>
  );
}

function SetPassword({ token, name, onDone, onBack }: { token: string; name: string; onDone: () => void; onBack: () => void }) {
  const { t } = usePrefs();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState<{ p1?: string; p2?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (p1.length < 8) return setErr({ p1: t('errPwShort') });
    if (p1 !== p2) return setErr({ p2: t('errPwMatch') });
    setErr({});
    setBusy(true);
    try {
      await api('/auth/setup-password', { body: { setupToken: token, password: p1 } });
      onDone();
    } catch (x) {
      setErr({ form: t(x instanceof ApiError && x.code === 'invalid' ? 'errPwShort' : errorKey(x)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="login-card" onSubmit={submit} noValidate>
      <div>
        <h1>{t('setPwTitle')}</h1>
        <p className="muted" style={{ marginTop: 8 }}>{t('setPwSub', { name })}</p>
      </div>
      <div className="field">
        <label htmlFor="pw1">{t('newPw')}</label>
        <input className="input" id="pw1" type="password" autoComplete="new-password" autoFocus value={p1} onChange={(e) => setP1(e.target.value)} aria-invalid={!!err.p1} />
        {err.p1 ? <FieldErr msg={err.p1} /> : <span className="hint">{t('pwRule')}</span>}
      </div>
      <div className="field">
        <label htmlFor="pw2">{t('confirmPw')}</label>
        <input className="input" id="pw2" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} aria-invalid={!!err.p2} />
        <FieldErr msg={err.p2} />
      </div>
      {err.form && <p className="form-err" role="alert"><Icon name="alert" className="sm" />{err.form}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" type="submit" style={{ flex: 1 }} disabled={busy}>
          <Icon name="key" />
          {t('savePw')}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onBack}>{t('back')}</button>
      </div>
    </form>
  );
}
