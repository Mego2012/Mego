import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { Icon } from '../components/icons';
import { useApp } from '../app/AppContext';
import { MegoMark } from '../components/instrument';
import { Card, NumField, Segmented, TextField, useAsync } from '../components/ui';
import { accountState, chooseGuest, enterAccount, guestDataSummary, leaveAccount, subscribeAccount, userDbName, type AccountState } from '../lib/account';
import { downloadBackup } from '../lib/backup';
import { SYNC_TABLES } from '../lib/db';
import { adminListErrors, adminListProfiles, adminListSubmissions, adminReview, adminSetStatus, adminStats, type Submission, AI_RESTRICTED_COUNTRIES, cloud, deleteAccountAuth, login, register, resetPassword, updateMyProfile } from '../lib/firebase';
import { recommend } from '../lib/goals';
import type { GoalType, Macros, Profile } from '../lib/types';

export function useAccount(): AccountState {
  const [s, setS] = useState<AccountState>(accountState());
  useEffect(() => subscribeAccount(setS), []);
  return s;
}

const COUNTRIES = ['SA', 'EG', 'AE', 'KW', 'QA', 'BH', 'OM', 'JO', 'LB', 'MA', 'DZ', 'TN', 'IQ', 'SD', 'LY', 'PS', 'SY', 'YE', 'TR', 'US', 'CA', 'IN', 'PK', 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'CH', 'OTHER'];
const authError = (e: unknown, t: (k: string) => string) => {
  const code = String((e as { code?: string }).code ?? (e as Error).message ?? '');
  const key = 'authErr_' + code.replace('auth/', '').replace(/[^a-zA-Z-]/g, '').replace(/-/g, '_');
  return t(key) !== key ? t(key) : t('authErr_generic');
};

/* ------------------------------------------------------------------ welcome / landing */

export function Welcome() {
  const { t } = useApp();
  const [mode, setMode] = useState<'start' | 'login' | 'register' | 'reset'>('start');
  return (
    <div className="welcome" data-testid="welcome">
      <div className="welcome-inner">
        <div className="welcome-brand"><MegoMark size={56} /><div className="brand-word" style={{ fontSize: 28 }}>MEGO</div></div>
        {mode === 'start' && (
          <>
            <h1 className="welcome-title">{t('wel_title')}</h1>
            <p className="welcome-sub">{t('wel_sub')}</p>
            <ul className="welcome-points">
              {['wel_p1', 'wel_p2', 'wel_p3', 'wel_p4'].map((k) => <li key={k}>{t(k)}</li>)}
            </ul>
            <div className="stack">
              <button className="btn primary block" onClick={() => setMode('register')} data-testid="wel-register">{t('auth_create')}</button>
              <button className="btn block" onClick={() => setMode('login')} data-testid="wel-login">{t('auth_signin')}</button>
              <button className="btn ghost block" onClick={chooseGuest} data-testid="wel-guest">{t('auth_guest')}</button>
            </div>
            <p className="tiny muted center">{t('wel_free')}</p>
          </>
        )}
        {mode === 'login' && <LoginForm onBack={() => setMode('start')} onReset={() => setMode('reset')} />}
        {mode === 'register' && <RegisterFlow onBack={() => setMode('start')} />}
        {mode === 'reset' && <ResetForm onBack={() => setMode('login')} />}
        <div className="row center" style={{ justifyContent: 'center', gap: 14, marginTop: 18 }}>
          <Link className="tiny" to="/privacy">{t('privacy')}</Link><Link className="tiny" to="/terms">{t('terms')}</Link>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onBack, onReset }: { onBack: () => void; onReset: () => void }) {
  const { t } = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [importGuest, setImportGuest] = useState(false);
  const [guest, setGuest] = useState<{ entries: number } | null>(null);
  useEffect(() => { guestDataSummary().then(setGuest); }, []);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault(); setErr(''); setBusy(true);
      try { const u = await login(email, pw); enterAccount(u.uid, importGuest); } catch (x) { setErr(authError(x, t)); setBusy(false); }
    }} data-testid="login-form">
      <h2 className="welcome-h2">{t('auth_signin')}</h2>
      <TextField label={t('auth_email')} value={email} onChange={setEmail} dir="ltr" testId="login-email" />
      <label className="field"><span>{t('auth_password')}</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="login-password" /></label>
      {!!guest?.entries && <label className="check"><input type="checkbox" checked={importGuest} onChange={(e) => setImportGuest(e.target.checked)} />{t('auth_importGuest', { n: guest.entries })}</label>}
      {err && <div className="banner error small" role="alert" data-testid="auth-error">{err}</div>}
      <button className="btn primary block" disabled={busy || !email || !pw} data-testid="login-submit">{t('auth_signin')}</button>
      <div className="row between"><button type="button" className="btn ghost sm" onClick={onBack}>{t('previous')}</button><button type="button" className="btn ghost sm" onClick={onReset} data-testid="forgot">{t('auth_forgot')}</button></div>
    </form>
  );
}

function ResetForm({ onBack }: { onBack: () => void }) {
  const { t } = useApp();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  return (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { await resetPassword(email); setState('sent'); } catch { setState('error'); } }} data-testid="reset-form">
      <h2 className="welcome-h2">{t('auth_forgot')}</h2>
      <p className="small muted">{t('auth_resetHint')}</p>
      <TextField label={t('auth_email')} value={email} onChange={setEmail} dir="ltr" testId="reset-email" />
      {/* the same message whether or not the address exists — no account enumeration */}
      {state === 'sent' && <div className="banner info small" data-testid="reset-sent">{t('auth_resetSent')}</div>}
      {state === 'error' && <div className="banner error small">{t('authErr_generic')}</div>}
      <button className="btn primary block" disabled={!email} data-testid="reset-submit">{t('auth_sendReset')}</button>
      <button type="button" className="btn ghost sm" onClick={onBack}>{t('previous')}</button>
    </form>
  );
}

function RegisterFlow({ onBack }: { onBack: () => void }) {
  const { t, n } = useApp();
  const [step, setStep] = useState(1);
  const [a, setA] = useState({ name: '', email: '', pw: '', country: 'SA', age18: false, terms: false });
  const [p, setP] = useState<Pick<Profile, 'sex' | 'age' | 'heightCm' | 'currentWeight' | 'targetWeight' | 'activityLevel' | 'goalType'>>({ sex: 'male', age: 30, heightCm: 170, currentWeight: 75, targetWeight: 70, activityLevel: 'moderate', goalType: 'fat_loss_preserve' });
  const rec = useMemo(() => recommend({ ...p, startWeight: p.currentWeight, weeklyChangeKg: 0, goal: '', trainingDaysPerWeek: 3 } as Profile), [p]);
  const [targets, setTargets] = useState<Macros | null>(null);
  const tg = targets ?? rec.targets ?? { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [guest, setGuest] = useState<{ entries: number } | null>(null);
  const [importGuest, setImportGuest] = useState(false);
  useEffect(() => { guestDataSummary().then(setGuest); }, []);
  const pwOk = a.pw.length >= 8 && /\d/.test(a.pw) && /[A-Za-z]/.test(a.pw);
  const step1Ok = a.name.trim() && /.+@.+\..+/.test(a.email) && pwOk && a.age18 && a.terms;
  const num = (k: keyof typeof p) => (v: number | '') => setP({ ...p, [k]: v === '' ? 0 : v });
  return (
    <div className="stack" data-testid="register-flow">
      <div className="steps" aria-label={t('reg_step', { n: step })}>{[1, 2, 3].map((s) => <i key={s} className={s <= step ? 'on' : ''} />)}</div>
      {step === 1 && (
        <>
          <h2 className="welcome-h2">{t('auth_create')}</h2>
          <TextField label={t('reg_name')} value={a.name} onChange={(v) => setA({ ...a, name: v })} testId="reg-name" />
          <TextField label={t('auth_email')} value={a.email} onChange={(v) => setA({ ...a, email: v })} dir="ltr" testId="reg-email" />
          <label className="field"><span>{t('auth_password')}</span><input className="input" type="password" autoComplete="new-password" value={a.pw} onChange={(e) => setA({ ...a, pw: e.target.value })} data-testid="reg-password" /></label>
          <div className={`tiny ${a.pw && !pwOk ? 'attention-text' : 'muted'}`}>{t('reg_pwRule')}</div>
          <label className="field"><span>{t('reg_country')}</span>
            <select className="input" value={a.country} onChange={(e) => setA({ ...a, country: e.target.value })} data-testid="reg-country">
              {COUNTRIES.map((c) => <option key={c} value={c}>{c === 'OTHER' ? t('reg_other') : new Intl.DisplayNames([document.documentElement.lang || 'ar'], { type: 'region' }).of(c)}</option>)}
            </select></label>
          {AI_RESTRICTED_COUNTRIES.has(a.country) && <div className="tiny muted">{t('reg_aiRegion')}</div>}
          <label className="check"><input type="checkbox" checked={a.age18} onChange={(e) => setA({ ...a, age18: e.target.checked })} data-testid="reg-age18" />{t('reg_age18')}</label>
          <label className="check"><input type="checkbox" checked={a.terms} onChange={(e) => setA({ ...a, terms: e.target.checked })} data-testid="reg-terms" />
            <span>{t('reg_accept')} <Link to="/privacy">{t('privacy')}</Link> · <Link to="/terms">{t('terms')}</Link></span></label>
          <div className="row"><button className="btn" onClick={onBack}>{t('previous')}</button><button className="btn primary grow" disabled={!step1Ok} onClick={() => setStep(2)} data-testid="reg-next1">{t('next')}</button></div>
        </>
      )}
      {step === 2 && (
        <>
          <h2 className="welcome-h2">{t('reg_body')}</h2>
          <Segmented value={p.sex} onChange={(v) => setP({ ...p, sex: v })} options={[{ value: 'male', label: t('male') }, { value: 'female', label: t('female') }]} />
          <div className="grid2">
            <NumField label={t('age')} value={p.age} onChange={num('age')} testId="reg-age" />
            <NumField label={t('height')} suffix={t('cm')} value={p.heightCm} onChange={num('heightCm')} testId="reg-height" />
            <NumField label={t('currentWeight')} suffix={t('kg')} value={p.currentWeight} onChange={num('currentWeight')} testId="reg-weight" />
            <NumField label={t('targetWeight')} suffix={t('kg')} value={p.targetWeight} onChange={num('targetWeight')} testId="reg-target" />
          </div>
          <label className="field"><span>{t('activity')}</span>
            <select className="input" value={p.activityLevel} onChange={(e) => setP({ ...p, activityLevel: e.target.value as Profile['activityLevel'] })} data-testid="reg-activity">
              {(['sedentary', 'light', 'moderate', 'active', 'very_active'] as const).map((x) => <option key={x} value={x}>{t('act_' + x)}</option>)}
            </select></label>
          <label className="field"><span>{t('goalType')}</span>
            <select className="input" value={p.goalType} onChange={(e) => { setP({ ...p, goalType: e.target.value as GoalType }); setTargets(null); }} data-testid="reg-goal">
              {(['fat_loss', 'fat_loss_preserve', 'maintain', 'recomp', 'lean_bulk', 'bulk'] as GoalType[]).map((g) => <option key={g} value={g}>{t('goal_' + g)}</option>)}
            </select></label>
          <div className="row"><button className="btn" onClick={() => setStep(1)}>{t('previous')}</button><button className="btn primary grow" disabled={!(p.age >= 18 && p.heightCm > 100 && p.currentWeight > 30)} onClick={() => setStep(3)} data-testid="reg-next2">{t('next')}</button></div>
        </>
      )}
      {step === 3 && (
        <>
          <h2 className="welcome-h2">{t('reg_targets')}</h2>
          <div className="small muted">{t('recommendationNote', { bmr: n(rec.bmr), tdee: n(rec.tdee), ppk: n(tg.protein / Math.max(1, p.currentWeight), 1) })}</div>
          <div className="grid2">
            {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <NumField key={k} label={t(k)} value={tg[k]} onChange={(v) => setTargets({ ...tg, [k]: Number(v) || 0 })} testId={`reg-t-${k}`} />)}
          </div>
          <div className="tiny muted">{t('reg_targetsNote')}</div>
          {!!guest?.entries && <label className="check"><input type="checkbox" checked={importGuest} onChange={(e) => setImportGuest(e.target.checked)} data-testid="reg-import" />{t('auth_importGuest', { n: guest.entries })}</label>}
          {err && <div className="banner error small" role="alert" data-testid="auth-error">{err}</div>}
          <div className="row"><button className="btn" onClick={() => setStep(2)}>{t('previous')}</button>
            <button className="btn primary grow" disabled={busy} data-testid="reg-submit" onClick={async () => {
              setBusy(true); setErr('');
              try {
                const u = await register(a.email, a.pw, a.name, a.country === 'OTHER' ? 'ZZ' : a.country, a.age18);
                try { localStorage.setItem('mego.pendingSetup.' + u.uid, JSON.stringify({ profile: { ...p, name: a.name.trim(), startWeight: p.currentWeight }, targets: tg })); } catch { /* ignore */ }
                enterAccount(u.uid, importGuest);
              } catch (x) { setErr(authError(x, t)); setBusy(false); }
            }}>{t('reg_finish')}</button></div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ account card (Settings) */

export function AccountCard() {
  const { t, d } = useApp();
  const acc = useAccount();
  const nav = useNavigate();
  const { run } = useAsync();
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState('');
  const [name, setName] = useState(acc.profile?.displayName ?? '');
  useEffect(() => setName(acc.profile?.displayName ?? ''), [acc.profile?.displayName]);
  if (!acc.cloud) return null;
  if (acc.mode !== 'account') {
    return (
      <Card title={<><Icon name="user" />{t('acc_title')}</>}>
        <div className="small muted">{t('acc_guestNote')}</div>
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => { try { localStorage.removeItem('mego.guest'); } catch { /* ignore */ } location.reload(); }} data-testid="acc-signin">{t('auth_signin')} / {t('auth_create')}</button>
      </Card>
    );
  }
  return (
    <Card title={<><Icon name="user" />{t('acc_title')}</>}>
      <div className="stack" data-testid="account-card">
        <div className="acc-id">
          <span className="avatar sm" aria-hidden="true">{(acc.profile?.displayName ?? '?').trim().slice(0, 1).toUpperCase()}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="bold ellipsis">{acc.profile?.displayName}</div>
            <div className="tiny muted ellipsis" dir="ltr" style={{ textAlign: 'start' }}>{acc.profile?.email}</div>
            {acc.profile && <div className="tiny muted">{t('acc_since', { date: d(new Date(acc.profile.createdAt).toISOString().slice(0, 10)) })}</div>}
          </div>
          <span className="chip good"><Icon name="cloud" /> {t('acc_synced')}</span>
        </div>
        <div className="row"><div className="grow"><TextField label={t('reg_name')} value={name} onChange={setName} testId="acc-name" /></div>
          <button className="btn sm" style={{ alignSelf: 'flex-end' }} onClick={() => run(() => updateMyProfile(acc.uid!, { displayName: name.trim().slice(0, 40) }), t('saved'))}>{t('save')}</button></div>
        <div className="acc-actions">
          {acc.admin && <button className="btn" onClick={() => nav('/admin')} data-testid="open-admin"><Icon name="shield" /> {t('admin_title')}</button>}
          <button className="btn" onClick={() => downloadBackup()} data-testid="acc-export"><Icon name="download" /> {t('acc_export')}</button>
          <button className="btn" onClick={async () => { const { logout } = await import('../lib/firebase'); await logout(); leaveAccount(); }} data-testid="acc-logout"><Icon name="logout" /> {t('acc_logout')}</button>
          <button className="btn danger" onClick={() => setDel(true)} data-testid="acc-delete"><Icon name="trash" /> {t('acc_delete')}</button>
        </div>
        {del && (
          <div className="notice warn stack" data-testid="delete-confirm">
            <div className="small">{t('acc_deleteWarn')}</div>
            <label className="field"><span>{t('auth_password')}</span><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="delete-password" /></label>
            <div className="row"><button className="btn" onClick={() => setDel(false)}>{t('cancel')}</button>
              <button className="btn danger grow" disabled={!pw} data-testid="delete-confirm-btn" onClick={() => run(async () => { await deleteMyAccount(acc.uid!, pw); })}>{t('acc_deleteConfirm')}</button></div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Deletes the user's cloud records, profile and login, then the local account database. Guest data is untouched. */
export async function deleteMyAccount(uid: string, password: string) {
  const { fs } = cloud();
  // verify the password first (Google requires a recent sign-in) before removing anything
  const { EmailAuthProvider, reauthenticateWithCredential } = await import('firebase/auth');
  const u = cloud().auth.currentUser;
  if (!u?.email) throw new Error('NOT_SIGNED_IN');
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
  for (const table of Object.keys(SYNC_TABLES)) {
    const snap = await getDocs(collection(fs, 'users', uid, table));
    for (const d of snap.docs) await deleteDoc(d.ref);
  }
  await deleteDoc(doc(fs, 'profiles', uid));
  await deleteAccountAuth(password);
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase(userDbName(uid)); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  leaveAccount();
}

/* ------------------------------------------------------------------ admin dashboard (aggregates only) */

export function AdminPage() {
  const { t, d, n } = useApp();
  const acc = useAccount();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminStats>> | null>(null);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof adminListProfiles>>>([]);
  const [errors, setErrors] = useState<Awaited<ReturnType<typeof adminListErrors>>>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [msg, setMsg] = useState('');
  const { run } = useAsync();
  const reload = async () => {
    try { setStats(await adminStats()); setUsers(await adminListProfiles()); setErrors(await adminListErrors()); setSubs(await adminListSubmissions()); } catch (e) { setMsg((e as Error).message); }
  };
  useEffect(() => { if (acc.admin) reload(); }, [acc.admin]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!acc.admin) return <div className="empty">{t('admin_only')}</div>;
  return (
    <div data-testid="admin">
      <div className="admin-privacy"><Icon name="lock" /><span>{t('admin_privacy')}</span></div>
      {msg && <div className="banner error small">{msg}</div>}
      <div className="admin-kpis" data-testid="admin-stats">
        {([['users', 'admin_users', stats?.total, 'primary'], ['chart', 'admin_active', stats?.active7d, 'good'], ['lock', 'admin_suspended', stats?.suspended, 'warn'], ['foods', 'admin_pendingFoods', stats?.pendingFoods, 'info']] as const).map(([icon, k, v, tone]) => (
          <div key={k} className="kpi" style={{ ['--tone' as string]: `var(--${tone})` }}>
            <span className="kpi-i"><Icon name={icon} /></span>
            <div className="v num">{stats ? n(v ?? 0) : '…'}</div>
            <div className="k">{t(k)}</div>
          </div>
        ))}
        {stats && stats.total > 0 && <div className="kpi-bar" aria-hidden="true"><i style={{ width: `${(stats.active7d / stats.total) * 100}%` }} /></div>}
      </div>
      <Card title={<><Icon name="users" />{t('admin_accounts')}</>}>
        <ul className="list" data-testid="admin-users">
          {users.map((u) => (
            <li key={u.uid}>
              <span className={`avatar sm ${u.status}`} aria-hidden="true">{(u.displayName || '?').trim().slice(0, 1).toUpperCase()}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="bold ellipsis">{u.displayName} <span className="tiny muted" dir="ltr">{u.email}</span></div>
                <div className="tiny muted">{u.country} · {t('acc_since', { date: d(new Date(u.createdAt).toISOString().slice(0, 10)) })} · {t('admin_lastActive')} {d(new Date(u.lastActiveAt).toISOString().slice(0, 10))}</div>
              </div>
              <span className={`chip ${u.status === 'active' ? 'good' : 'warn'}`}>{t('status_' + u.status)}</span>
              {u.uid !== acc.uid && <button className="btn sm" data-testid="admin-toggle" onClick={() => run(async () => { await adminSetStatus(u.uid, u.status === 'active' ? 'suspended' : 'active'); await reload(); }, t('saved'))}>{u.status === 'active' ? t('admin_suspend') : t('admin_reactivate')}</button>}
            </li>
          ))}
        </ul>
      </Card>
      <Card title={<><Icon name="foods" />{t('admin_pendingFoods')}</>}>
        <ul className="list" data-testid="admin-subs">
          {subs.map((sub) => {
            const f = sub.food as { nameAr?: string; nameEn?: string; per100?: { kcal: number; protein: number; carbs: number; fat: number }; state?: string; notes?: string; sourceRef?: string };
            return (
              <li key={sub.id}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="bold">{f.nameAr || f.nameEn} <span className="chip">{t('state_' + (f.state ?? 'other'))}</span></div>
                  <div className="tiny muted num">{f.per100?.kcal} kcal · P {f.per100?.protein} · C {f.per100?.carbs} · F {f.per100?.fat} / 100 g{f.sourceRef ? ` · ${f.sourceRef}` : ''}</div>
                  {f.notes && <div className="tiny muted">{f.notes}</div>}
                </div>
                <button className="btn sm primary" data-testid="sub-approve" onClick={() => run(async () => { await adminReview(sub, true); await reload(); }, t('saved'))}>{t('admin_approve')}</button>
                <button className="btn sm" data-testid="sub-reject" onClick={() => run(async () => { await adminReview(sub, false); await reload(); }, t('saved'))}>{t('admin_reject')}</button>
              </li>
            );
          })}
          {!subs.length && <li className="empty">{t('admin_noSubs')}</li>}
        </ul>
        <div className="tiny muted">{t('admin_reviewNote')}</div>
      </Card>
      <Card title={<><Icon name="info" />{t('admin_errors')}</>}>
        <ul className="list">{errors.map((e) => <li key={e.id} className="small"><span className="chip">{e.kind}</span><span className="grow">{e.message}</span><span className="tiny muted">{d(new Date(e.at).toISOString().slice(0, 10))}</span></li>)}
          {!errors.length && <li className="empty">{t('admin_noErrors')}</li>}</ul>
      </Card>
      <Card title={<><Icon name="grid" />{t('admin_foods')}</>}>
        <div className="small muted">{t('admin_foodsNote')}</div>
        <button className="btn" style={{ marginTop: 8 }} data-testid="admin-publish" onClick={() => run(async () => {
          const { db } = await import('../lib/db');
          const { publishSharedFoods } = await import('../lib/cloudSync');
          const foods = (await db.foods.toArray()).filter((f) => f.source === 'sheet' && !f.archived && !f.incomplete);
          const count = await publishSharedFoods(foods);
          setMsg(t('admin_published', { n: count }));
        })}>{t('admin_publish')}</button>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ suspended + legal */

export function Suspended() {
  const { t } = useApp();
  return (
    <div className="welcome"><div className="welcome-inner stack" data-testid="suspended">
      <div className="welcome-brand"><MegoMark size={48} /></div>
      <h1 className="welcome-title">{t('acc_suspendedTitle')}</h1>
      <p className="welcome-sub">{t('acc_suspendedText')}</p>
      <button className="btn block" onClick={async () => { const { logout } = await import('../lib/firebase'); await logout(); leaveAccount(); }}>{t('acc_logout')}</button>
    </div></div>
  );
}

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { t } = useApp();
  const keys = kind === 'privacy' ? ['pp_1', 'pp_2', 'pp_3', 'pp_4', 'pp_5', 'pp_6', 'pp_7', 'pp_8'] : ['tos_1', 'tos_2', 'tos_3', 'tos_4', 'tos_5', 'tos_6'];
  return (
    <div className="legal" data-testid={`legal-${kind}`}>
      <h1>{t(kind)}</h1>
      <p className="tiny muted">{t('legal_draft')}</p>
      {keys.map((k) => <section key={k}><h3>{t(k + '_h')}</h3><p>{t(k)}</p></section>)}
      <Link to="/" className="btn">{t('previous')}</Link>
    </div>
  );
}

/** Lazy entry point for all account screens. */
export function AccountRouter({ view }: { view: 'welcome' | 'suspended' | 'admin' | 'privacy' | 'terms' }) {
  if (view === 'welcome') return <Welcome />;
  if (view === 'suspended') return <Suspended />;
  if (view === 'admin') return <AdminPage />;
  return <LegalPage kind={view} />;
}
