import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/icons';
import { FoodThumb } from '../components/FoodThumb';
import { loadPhotoManifest, type PhotoCredit } from '../lib/foodPhotos';
import { useApp } from '../app/AppContext';
import { useSyncStatus } from '../components/Layout';
import { Card, Confirm, NumField, Segmented, TextField, useAsync } from '../components/ui';
import { differsFromRecommendation, recommend } from '../lib/goals';
import { listPreMigrationBackups, restoreLocalBackup, saveLocalBackup } from '../lib/localBackup';
import { GOAL_TYPES, type GoalType, type Profile } from '../lib/types';
import { DIET_TAGS } from '../lib/intelCatalog';
import { lazy, Suspense } from 'react';
const AccountCard = lazy(() => import('./Account').then((m) => ({ default: m.AccountCard })));
function AccountCardLazy() { return <Suspense fallback={null}><AccountCard /></Suspense>; }
import { backupToDrive, downloadBackup, restoreBackup } from '../lib/backup';
import { db } from '../lib/db';
import { exportDiaryCSV } from '../lib/exporters';
import { DICTS, WEEKDAY_KEYS } from '../lib/i18n';
import { macroCalories } from '../lib/targets';
import { saveSettings } from '../lib/repo';
import backendCode from '../../apps-script/Code.gs?raw';
import backendManifest from '../../apps-script/appsscript.json?raw';
import { checkHubFoods, HUB_ID, HUB_NAME, parseConnectionCode, pullAll, pullFoodsFromSheet, pushNow, queueFullUpload, setAiKey, testConnection, type HubFoodCheck } from '../lib/sync';
import type { Lang, Macros, ThemeMode } from '../lib/types';

/** Who this device belongs to and the targets in force — the first thing on the settings screen. */
function SettingsHeader() {
  const { t, n, settings } = useApp();
  const p = settings.profile;
  const tg = settings.targets.training;
  const initials = (p.name ?? '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <section className="settings-head">
      <span className="avatar" aria-hidden="true">{initials || <Icon name="user" />}</span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="sh-name">{p.name || t('profile')}</div>
        <div className="tiny muted">{t('goal_' + p.goalType).split(' — ')[0]}{p.currentWeight ? ` · ${n(p.currentWeight, 1)} ${t('kg')} → ${n(p.targetWeight, 1)} ${t('kg')}` : ''}</div>
        <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
          <span className="chip num">{n(tg.kcal)} {t('kcalUnit')}</span>
          <span className="chip num" style={{ color: 'var(--protein)' }}>{t('pShort')} {n(tg.protein)}</span>
          <span className="chip num" style={{ color: 'var(--carbs)' }}>{t('cShort')} {n(tg.carbs)}</span>
          <span className="chip num" style={{ color: 'var(--fat)' }}>{t('fShort')} {n(tg.fat)}</span>
        </div>
      </div>
    </section>
  );
}

export default function Settings() {
  const { settings, t } = useApp();
  return (
    <div data-testid="settings-page" className="settings">
      <SettingsHeader />
      <nav className="tool-row settings-index" aria-label={t('nav_settings')}>
        {([['s-account', 'user', 'acc_title'], ['s-look', 'globe', 'language'], ['s-profile', 'scale', 'profile'], ['s-targets', 'target', 'nutritionTargets'],
          ['s-diet', 'leaf', 'diet_title'], ['s-sync', 'sync', 'syncTitle'], ['s-ai', 'camera', 'aiScannerStatus'], ['s-data', 'shield', 'dataSafety']] as const).map(([id, icon, key]) => (
          <a key={id} className="chip clickable" href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Icon name={icon} /> {t(key)}</a>
        ))}
      </nav>
      <div id="s-account"><AccountCardLazy /></div>
      <div id="s-look"><Preferences /></div>
      <div id="s-profile"><ProfileForm key={'p' + settings.updatedAt} /></div>
      <div id="s-targets"><TargetsForm key={'t' + settings.updatedAt} /></div>
      <div id="s-diet"><DietForm /></div>
      <div id="s-sync"><SyncForm /></div>
      <div id="s-ai"><AiScannerCard /></div>
      <div id="s-data"><DataSafety /><DataCheckCard /><LocalBackups /></div>
      <PhotoCredits />
    </div>
  );
}

function Preferences() {
  const { t, settings } = useApp();
  return (
    <Card title={<><Icon name="globe" />{t('language')} · {t('theme')}</>}>
      <div className="stack">
        <Segmented<Lang> value={settings.lang} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]}
          onChange={(lang) => saveSettings((s) => { s.lang = lang; })} />
        <Segmented<ThemeMode> value={settings.theme} options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t('theme_' + v) }))}
          onChange={(theme) => saveSettings((s) => { s.theme = theme; })} />
      </div>
    </Card>
  );
}

function ProfileForm() {
  const { t, settings, n } = useApp();
  const [p, setP] = useState<Profile>(settings.profile);
  const [confirmRec, setConfirmRec] = useState(false);
  const { run } = useAsync();
  const num = (k: keyof Profile) => (v: number | '') => setP({ ...p, [k]: v === '' ? 0 : v });
  const rec = recommend(p);
  const cur = settings.targets.training;
  const fmt = (m: { kcal: number; protein: number; carbs: number; fat: number }) => `${n(m.kcal)} ${t('kcalUnit')} · ${n(m.protein)}/${n(m.carbs)}/${n(m.fat)} ${t('g')}`;
  return (
    <Card title={<><Icon name="user" />{t('profile')}</>}>
      <div style={{ marginBottom: 10 }}><TextField label={t('yourName')} value={p.name ?? ''} onChange={(v) => setP({ ...p, name: v.slice(0, 30) })} testId="profile-name" /></div>
      <label className="field" style={{ marginBottom: 10 }}>
        <span>{t('goalType')}</span>
        <select className="input" value={p.goalType} onChange={(e) => setP({ ...p, goalType: e.target.value as GoalType })} data-testid="goal-select" style={{ fontWeight: 600 }}>
          {GOAL_TYPES.map((g) => <option key={g} value={g}>{t('goal_' + g)}</option>)}
        </select>
      </label>
      {p.goalType === 'custom' && <div style={{ marginBottom: 10 }}><TextField label={t('customGoal')} value={p.goal} onChange={(v) => setP({ ...p, goal: v })} testId="goal-custom" /></div>}
      <div className="grid2">
        <label className="field"><span>{t('sex')}</span>
          <select className="input" value={p.sex} onChange={(e) => setP({ ...p, sex: e.target.value as 'male' | 'female' })}>
            <option value="male">{t('male')}</option><option value="female">{t('female')}</option></select></label>
        <NumField label={t('age')} value={p.age} onChange={num('age')} />
        <NumField label={t('height')} suffix={t('cm')} value={p.heightCm} onChange={num('heightCm')} />
        <NumField label={t('currentWeight')} suffix={t('kg')} value={p.currentWeight} onChange={num('currentWeight')} testId="profile-weight" />
        <NumField label={t('startWeight')} suffix={t('kg')} value={p.startWeight} onChange={num('startWeight')} />
        <NumField label={t('targetWeight')} suffix={t('kg')} value={p.targetWeight} onChange={num('targetWeight')} />
        <NumField label={t('startWaist')} suffix={t('cm')} value={p.startWaist ?? ''} onChange={(v) => setP({ ...p, startWaist: v === '' ? undefined : v })} />
        <NumField label={t('weeklyChange')} value={p.weeklyChangeKg} onChange={num('weeklyChangeKg')} step="0.05" />
        <label className="field"><span>{t('activity')}</span>
          <select className="input" value={p.activityLevel ?? 'moderate'} onChange={(e) => setP({ ...p, activityLevel: e.target.value as Profile['activityLevel'] })} data-testid="activity-select">
            {(['sedentary', 'light', 'moderate', 'active', 'very_active'] as const).map((a) => <option key={a} value={a}>{t('act_' + a)}</option>)}
          </select></label>
        <NumField label={t('trainingDaysPerWeek')} value={p.trainingDaysPerWeek} onChange={num('trainingDaysPerWeek')} />
      </div>
      <div className="stat" style={{ marginTop: 10 }} data-testid="recommendation">
        <div className="k">{t('recommendation')}: {t('goal_' + p.goalType)}</div>
        {rec.targets ? (
          <>
            <div className="v num" data-testid="rec-values">{fmt(rec.targets)}</div>
            <div className="tiny muted">{t('recommendationNote', { bmr: n(rec.bmr), tdee: n(rec.tdee), ppk: n(rec.targets.protein / p.currentWeight, 1) })} {rec.expectedWeeklyKg !== null ? `· ${t('expectedChange', { kg: n(rec.expectedWeeklyKg, 2) })}` : ''}</div>
            {differsFromRecommendation(cur, rec) && <div className="tiny" style={{ marginTop: 4 }} data-testid="targets-differ">{t('targetsDiffer')} ({fmt(cur)})</div>}
          </>
        ) : <div className="tiny muted">—</div>}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary grow" onClick={() => run(() => saveSettings((s) => { s.profile = p; }), t('saved'))} data-testid="profile-save">{t('save')}</button>
        {rec.targets && differsFromRecommendation(cur, rec) && <button className="btn grow" onClick={() => setConfirmRec(true)} data-testid="apply-rec">{t('applyRecommendation')}</button>}
      </div>
      {confirmRec && rec.targets && (
        <Confirm message={t('confirmApplyRec', { cur: fmt(cur), rec: fmt(rec.targets) })} onNo={() => setConfirmRec(false)}
          onYes={async () => { setConfirmRec(false); await run(() => saveSettings((s) => { s.profile = p; s.targets = { training: { ...rec.targets! }, rest: { ...rec.targets! } }; }), t('saved')); }} />
      )}
    </Card>
  );
}

function MacroInputs({ value, onChange, prefix }: { value: Macros; onChange: (m: Macros) => void; prefix: string }) {
  const { t, n } = useApp();
  return (
    <>
      <div className="grid4">
        {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
          <NumField key={k} label={t(k)} value={value[k]} onChange={(v) => onChange({ ...value, [k]: v === '' ? 0 : v })} testId={`${prefix}-${k}`} />
        ))}
      </div>
      <div className="tiny muted">{t('macroKcalCheck', { kcal: n(macroCalories(value)) })}</div>
    </>
  );
}

function TargetsForm() {
  const { t, settings } = useApp();
  const [v, setV] = useState({ targets: settings.targets, trainingWeekdays: settings.trainingWeekdays, tolerance: settings.tolerance, autoCompletePastDays: settings.autoCompletePastDays, weekStartsOn: settings.weekStartsOn, completeThresholdPct: settings.completeThresholdPct, waterTargetMl: settings.waterTargetMl });
  const { run } = useAsync();
  return (
    <Card title={<><Icon name="target" />{t('nutritionTargets')}</>}>
      <div className="stack">
        <div className="small bold">{t('trainingTargets')}</div>
        <MacroInputs prefix="tt" value={v.targets.training} onChange={(m) => setV({ ...v, targets: { ...v.targets, training: m } })} />
        <div className="small bold">{t('restTargets')}</div>
        <MacroInputs prefix="rt" value={v.targets.rest} onChange={(m) => setV({ ...v, targets: { ...v.targets, rest: m } })} />
        <div className="small bold">{t('trainingWeekdays')}</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {[6, 0, 1, 2, 3, 4, 5].map((wd) => {
            const on = v.trainingWeekdays.includes(wd);
            return <button key={wd} className={`chip ${on ? 'active' : ''}`} onClick={() => setV({ ...v, trainingWeekdays: on ? v.trainingWeekdays.filter((x) => x !== wd) : [...v.trainingWeekdays, wd] })}>{t(WEEKDAY_KEYS[wd])}</button>;
          })}
        </div>
        <div className="small bold">{t('tolerances')}</div>
        <div className="grid2">
          <NumField label={t('caloriePct')} value={v.tolerance.caloriePct} onChange={(x) => setV({ ...v, tolerance: { ...v.tolerance, caloriePct: Number(x) || 0 } })} />
          <NumField label={t('proteinPct')} value={v.tolerance.proteinPct} onChange={(x) => setV({ ...v, tolerance: { ...v.tolerance, proteinPct: Number(x) || 0 } })} />
          <label className="field"><span>{t('weekStart')}</span>
            <select className="input" value={v.weekStartsOn} onChange={(e) => setV({ ...v, weekStartsOn: Number(e.target.value) })}>
              {[6, 0, 1].map((wd) => <option key={wd} value={wd}>{t(WEEKDAY_KEYS[wd])}</option>)}</select></label>
        </div>
        <label className="check"><input type="checkbox" checked={v.autoCompletePastDays} onChange={(e) => setV({ ...v, autoCompletePastDays: e.target.checked })} />{t('autoComplete')}</label>
        <div className="grid2">
          <NumField label={t('completeThreshold')} value={v.completeThresholdPct} onChange={(x) => setV({ ...v, completeThresholdPct: Math.min(100, Math.max(0, Number(x) || 0)) })} testId="complete-threshold" />
          <NumField label={t('waterTarget')} value={v.waterTargetMl} onChange={(x) => setV({ ...v, waterTargetMl: Number(x) || 0 })} testId="water-target" />
        </div>
        <button className="btn primary block" data-testid="targets-save" onClick={() => run(() => saveSettings((s) => { Object.assign(s, v); }), t('saved'))}>{t('save')}</button>
      </div>
    </Card>
  );
}

function SyncForm() {
  const { t, settings, d, n } = useApp();
  const [cfg, setCfg] = useState(settings.sync);
  const [showTok, setShowTok] = useState(false);
  useEffect(() => setCfg((c) => ({ ...settings.sync, url: c.url || settings.sync.url, token: c.token || settings.sync.token })), [settings.sync]);
  const status = useSyncStatus();
  const { run, busy } = useAsync();
  const [code, setCode] = useState('');
  const [report, setReport] = useState<{ check: HubFoodCheck; imported?: string; uploaded?: boolean } | null>(null);
  const [params, setParams] = useSearchParams();
  const saveCfg = (c = cfg) => saveSettings((s) => { s.sync = { ...s.sync, url: c.url.trim(), token: c.token.trim(), autoSync: c.autoSync, writeFoodsToSheet: c.writeFoodsToSheet }; });

  /**
   * Connect → verify the Hub against the foods on this phone → (only if no value differs) import the Hub's food IDs
   * and upload this phone's records. Differences stop the flow and are shown; nothing is overwritten silently.
   */
  const connect = async (c = cfg) => {
    await saveCfg(c);
    let r;
    try {
      r = await testConnection({ ...c, hubNativeId: settings.sync.hubNativeId });
    } catch (e) {
      if (!/^HUB_CHANGED/.test((e as Error).message) || !window.confirm(t('hubChanged'))) throw e;
      r = await testConnection({ ...c, hubNativeId: settings.sync.hubNativeId }, { acceptNewHub: true });
    }
    alertOk(t('connectionOk', { name: r.spreadsheet, tab: r.foodSheet ?? '—' }) + '\n' + t(r.writable ? 'hubWritable' : 'hubReadOnly') + '\n' + t('aiScannerStatus') + ': ' + t(r.aiScanner ? 'aiScannerOn' : 'aiScannerOff'));
    if (!r.writable) return;
    const check = await checkHubFoods();
    if (check.different.length) { setReport({ check }); return; }
    await saveLocalBackup('pre-import');
    const imp = await pullFoodsFromSheet();
    await queueFullUpload();
    await pushNow();
    setReport({ check, imported: t('importDone', { added: imp.added, updated: imp.updated, unchanged: imp.unchanged }), uploaded: true });
  };

  // Deep link from the laptop setup (QR code): #/settings?connect=MEGO1|url|token → connect once, then drop it from the URL.
  useEffect(() => {
    const p = parseConnectionCode(params.get('connect') ?? '');
    if (!p) return;
    setParams((x) => { x.delete('connect'); return x; }, { replace: true });
    const next = { ...cfg, url: p.url, token: p.token };
    setCfg(next);
    run(() => connect(next));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card title={<span id="sync"><Icon name="sync" />{t('syncTitle')}</span>}>
      <div className="stack" data-testid="sync-form">
        <div className="stat" data-testid="hub-info">
          <div className="bold row" style={{ gap: 6 }}><Icon name="grid" /> {HUB_NAME}</div>
          <div className="tiny muted num" dir="ltr" style={{ wordBreak: 'break-all' }}>{t('hubSource')}: {HUB_ID}</div>
          {settings.sync.hubNativeId && <div className="tiny muted num" dir="ltr" style={{ wordBreak: 'break-all' }} data-testid="hub-native">{t('hubNative')}: {settings.sync.hubNativeId}</div>}
          <div className="tiny muted">{t('hubOnly')}</div>
        </div>
        <div className="small"><span className={`dot ${status.state}`} /> {t('syncState_' + status.state)} · {t('pending')}: <b data-testid="pending-count">{status.pending}</b>
          {settings.sync.lastPushAt ? ` · ${t('lastSync')}: ${d(new Date(settings.sync.lastPushAt).toISOString().slice(0, 10))} ${new Date(settings.sync.lastPushAt).toLocaleTimeString()}` : ''}</div>
        {status.error && <div className="banner error small">{status.error}</div>}
        <TextField label={t('connectionCode')} value={code} dir="ltr" placeholder="MEGO1|https://script.google.com/…|…" testId="connection-code" onChange={(v) => {
          setCode(v);
          const p = parseConnectionCode(v);
          if (p) { const next = { ...cfg, url: p.url, token: p.token }; setCfg(next); setCode(''); run(() => connect(next)); }
        }} />
        <details>
          <summary className="small">{t('manualConnection')}</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <TextField label={t('syncUrl')} value={cfg.url} onChange={(url) => setCfg({ ...cfg, url })} dir="ltr" placeholder="https://script.google.com/macros/s/…/exec" testId="sync-url" />
            <label className="field"><span>{t('syncToken')}</span>
              {/* secret: hidden by default, never shown on screen unless asked */}
              <div className="row" style={{ gap: 6 }}>
                <input className="input grow" type={showTok ? 'text' : 'password'} autoComplete="off" spellCheck={false} dir="ltr" value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} data-testid="sync-token" />
                <button type="button" className="btn sm" onClick={() => setShowTok((x) => !x)} aria-pressed={showTok} data-testid="sync-token-show">{t(showTok ? 'hide' : 'show')}</button>
              </div></label>
          </div>
        </details>
        <label className="check"><input type="checkbox" checked={cfg.autoSync} onChange={(e) => setCfg({ ...cfg, autoSync: e.target.checked })} />{t('autoSync')}</label>
        <label className="check"><input type="checkbox" checked={cfg.writeFoodsToSheet} onChange={(e) => setCfg({ ...cfg, writeFoodsToSheet: e.target.checked })} />{t('writeFoods')}</label>
        {report && (
          <div className={`notice${report.check.different.length ? ' warn' : ''}`} data-testid="hub-check">
            <div className="bold">{t('hubCheckTitle')}</div>
            <div className="small">{t('hubCheckLine', { identical: n(report.check.identical), hub: n(report.check.hubFoods), local: n(report.check.localFoods) })}</div>
            {report.check.onlyInHub.length > 0 && <div className="tiny">{t('hubOnlyInHub', { n: report.check.onlyInHub.length })}</div>}
            {report.check.onlyOnPhone.length > 0 && <div className="tiny">{t('hubOnlyOnPhone', { n: report.check.onlyOnPhone.length })}: {report.check.onlyOnPhone.slice(0, 5).join('، ')}</div>}
            {report.check.different.length > 0 && (
              <>
                <div className="small">{t('hubDifferent', { n: report.check.different.length })}</div>
                <ul className="tiny" style={{ margin: 0, paddingInlineStart: 18 }}>
                  {report.check.different.slice(0, 10).map((x) => <li key={x.name}>{x.name}: {x.local.kcal}/{x.local.protein}/{x.local.carbs}/{x.local.fat} → {x.hub.kcal}/{x.hub.protein}/{x.hub.carbs}/{x.hub.fat}</li>)}
                </ul>
                <button className="btn sm" disabled={busy} data-testid="hub-accept" onClick={() => run(async () => {
                  await saveLocalBackup('pre-import');
                  const imp = await pullFoodsFromSheet(); await queueFullUpload(); await pushNow();
                  setReport({ ...report, imported: t('importDone', { added: imp.added, updated: imp.updated, unchanged: imp.unchanged }), uploaded: true });
                })}>{t('hubAcceptSheet')}</button>
              </>
            )}
            {report.imported && <div className="tiny" data-testid="hub-imported">✓ {report.imported}{report.uploaded ? ' · ' + t('hubUploaded') : ''}</div>}
          </div>
        )}
        <div className="row wrap">
          <button className="btn primary" disabled={busy} data-testid="sync-save" onClick={() => run(() => connect())}>{t('save')} + {t('testConnection')}</button>
          <button className="btn" disabled={busy || !settings.sync.url} data-testid="pull-foods" onClick={() => run(async () => {
            const r = await pullFoodsFromSheet();
            alertOk(`${r.sheet}: ${t('importDone', { added: r.added, updated: r.updated, unchanged: r.unchanged })}`);
          })}>{t('pullFoods')}</button>
          <button className="btn" disabled={busy || !settings.sync.url} onClick={() => run(() => pushNow())} data-testid="push-now">{t('pushNow')}</button>
          <button className="btn" disabled={busy || !settings.sync.url} onClick={() => run(async () => { await queueFullUpload(); await pushNow(); }, t('saved'))}>{t('uploadAll')}</button>
          <button className="btn" disabled={busy || !settings.sync.url} onClick={() => run(async () => { await saveLocalBackup('pre-pull'); const c = await pullAll(); alertOk(t('restoreDone', { n: Object.values(c).reduce((a, b) => a + b, 0) })); })}>{t('restoreFromSheet')}</button>
          <button className="btn" disabled={busy || !settings.sync.url} onClick={() => run(async () => { const r = await backupToDrive(); alertOk(r.file); })}>{t('backupDrive')}</button>
        </div>
        <BackendHelper />
        <a className="small" href="https://github.com/Mego2012/Mego/blob/claude/nutrition-tracking-app-989rku/docs/PHONE-SETUP.md" target="_blank" rel="noreferrer">{t('setupGuide')} ↗</a>
      </div>
    </Card>
  );
}

/** Free AI meal scanner: Gemini API free-tier key, stored only in the backend's Script Properties. */
function AiScannerCard() {
  const { t, settings } = useApp();
  const [key, setKey] = useState('');
  const [state, setState] = useState<{ on: boolean; model?: string } | null>(null);
  const { run, busy } = useAsync();
  const connected = !!settings.sync.url && !!settings.sync.token;
  useEffect(() => {
    if (!connected) return;
    testConnection(settings.sync).then((r) => setState({ on: !!r.aiScanner, model: r.aiModel })).catch(() => setState(null));
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card title={<><Icon name="camera" />{t('aiScannerStatus')} — {t('aiFree')}</>}>
      <div className="stack" data-testid="ai-card">
        <div className="small" data-testid="ai-state">{!connected ? t('AI_NO_BACKEND') : state === null ? '…' : state.on ? `✓ ${t('aiScannerOn')} (${state.model})` : t('aiScannerOff')}</div>
        <div className="tiny muted">{t('aiFreeNote')}</div>
        <div className="tiny muted">{t('aiPrivacyNote')}</div>
        <a className="small" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">{t('aiGetKey')} ↗</a>
        <label className="field"><span>{t('aiKey')}</span>
          <input className="input" type="password" autoComplete="off" dir="ltr" value={key} onChange={(e) => setKey(e.target.value)} data-testid="ai-key" disabled={!connected} />
        </label>
        <div className="row wrap">
          <button className="btn primary" disabled={!connected || busy || key.trim().length < 20} data-testid="ai-key-save" onClick={() => run(async () => {
            try {
              const r = await setAiKey(key.trim());
              setKey('');
              setState({ on: r.aiScanner, model: r.aiModel });
            } catch (e) {
              const c = (e as Error).message;
              throw new Error(t(c) !== c ? t(c) : c);
            }
          }, t('saved'))}>{t('aiKeySave')}</button>
          {state?.on && <button className="btn danger" disabled={busy} data-testid="ai-key-remove" onClick={() => run(async () => { await setAiKey('', true); setState({ on: false }); }, t('saved'))}>{t('aiKeyRemove')}</button>}
        </div>
      </div>
    </Card>
  );
}

/** Food preferences for the Coach and Food Intelligence (they never change logged values or targets). */
function DietForm() {
  const { t, settings } = useApp();
  const ex = new Set(settings.foodExclusions ?? []);
  return (
    <Card title={<><Icon name="leaf" />{t('diet_title')}</>}>
      <div className="stack" data-testid="diet-form">
        <Segmented value={settings.diet ?? 'any'} onChange={(v) => saveSettings((s) => { s.diet = v; })}
          options={[{ value: 'any', label: t('diet_any') }, { value: 'vegetarian', label: t('diet_vegetarian') }, { value: 'vegan', label: t('diet_vegan') }]} />
        <div className="small muted">{t('diet_exclude')}</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {DIET_TAGS.map((tag) => (
            <button key={tag} className={`chip clickable ${ex.has(tag) ? 'on' : ''}`} data-testid={`diet-ex-${tag}`}
              onClick={() => saveSettings((s) => { const set = new Set(s.foodExclusions ?? []); if (set.has(tag)) set.delete(tag); else set.add(tag); s.foodExclusions = [...set]; })}>
              {ex.has(tag) ? '✕ ' : ''}{t('dtag_' + tag)}
            </button>
          ))}
        </div>
        <div className="tiny muted">{t('diet_note')}</div>
      </div>
    </Card>
  );
}

function alertOk(msg: string) {
  window.alert(msg);
}

function DataSafety() {
  const { t, lang } = useApp();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const entries = useLiveQuery(() => db.entries.toArray(), [], []);
  const fileRef = useRef<HTMLInputElement>(null);
  const { run } = useAsync();
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);
  return (
    <Card title={<><Icon name="shield" />{t('dataSafety')}</>}>
      <div className="stack">
        <div className="small" data-testid="persisted">{persisted ? '✓ ' + t('storagePersisted') : t('storageNotPersisted')}</div>
        <div className="row wrap">
          <button className="btn" onClick={() => downloadBackup()} data-testid="download-backup">{t('backupFile')}</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>{t('restoreFile')}</button>
          <button className="btn" onClick={() => exportDiaryCSV(entries, { ...DICTS.en, ...DICTS[lang] })}>{t('exportAllDiary')}</button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden data-testid="restore-input" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const c = await run(async () => { await saveLocalBackup('pre-restore'); return restoreBackup(await f.text()); });
          if (c) alertOk(t('restoreDone', { n: Object.values(c).reduce((a, b) => a + b, 0) }));
        }} />
      </div>
    </Card>
  );
}

function DataCheckCard() {
  const { t, d, n } = useApp();
  const [r, setR] = useState<import('../lib/dataCheck').DataCheck | null>(null);
  const { run, busy } = useAsync();
  return (
    <Card title={<><Icon name="lock" />{t('dc_title')}</>} actions={<button className="btn sm" disabled={busy} onClick={() => run(async () => setR(await (await import('../lib/dataCheck')).runDataCheck()))} data-testid="dc-run">{t('dc_run')}</button>}>
      <div className="tiny muted">{t('dc_note')}</div>
      {r && (
        <div className="stack" style={{ marginTop: 8 }} data-testid="dc-result">
          <ul className="adherence">
            <li><span>{t('dc_entries')}</span><b className="num" data-testid="dc-entries">{n(r.counts.entries)} · {n(r.counts.loggedDays)} {t('dc_daysWord')}</b></li>
            <li><span>{t('dc_range')}</span><b className="num">{r.firstEntry ? `${d(r.firstEntry)} – ${d(r.lastEntry!)}` : '—'}</b></li>
            <li><span>{t('dc_body')}</span><b className="num">{n(r.counts.weights)} / {n(r.counts.waists)}</b></li>
            <li><span>{t('dc_foods')}</span><b className="num">{n(r.counts.foods)} · {n(r.counts.recipes)}</b></li>
            <li><span>{t('dc_targets')}</span><b className="num">{r.targets ? `${n(r.targets.training)} / ${n(r.targets.rest)}` : '—'}</b></li>
            <li><span>{t('dc_backup')}</span><b className="num">{r.preUpdate ? `${d(new Date(r.preUpdate.at).toISOString().slice(0, 10))} · ${r.preUpdate.release ?? ''} · ${n(r.preUpdate.entries)}` : '—'}</b></li>
          </ul>
          <div className={`banner small ${r.intact === false ? 'error' : 'info'}`} data-testid="dc-intact">{r.intact === null ? t('dc_noBackup') : r.intact ? t('dc_ok') : t('dc_fewer')}</div>
          {(r.duplicateEntries.length > 0 || r.duplicateFoods.length > 0) && (
            <div className="banner info small" data-testid="dc-duplicates">
              {t('dc_dupTitle', { e: r.duplicateEntries.length, f: r.duplicateFoods.length })}
              <ul className="tiny" style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
                {r.duplicateEntries.slice(0, 30).map((g, i) => <li key={'e' + i}>{d(g.date)} · {t(g.meal)} · {g.name} · {n(g.grams)} {t('g')} × {g.copies}</li>)}
                {r.duplicateFoods.map((g, i) => <li key={'f' + i}>{t('dc_dupFood')}: {g.name} × {g.copies}</li>)}
              </ul>
              <div className="tiny">{t('dc_dupNote')}</div>
            </div>
          )}
          {r.suspectFoods.map((f) => (
            <div key={f.id} className="banner error small" data-testid="dc-suspect">
              {t('dc_suspect', { name: f.name, kcal: n(f.kcal), p: n(f.protein, 1) })}
              <div className="tiny">{t('dc_affected', { e: f.diaryEntries, r: f.myRecipes.length + f.libraryRecipes.length })}{f.libraryRecipes.length ? ` — ${f.libraryRecipes.join('، ')}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LocalBackups() {
  const { t, d } = useApp();
  const list = useLiveQuery(() => db.backups.orderBy('at').reverse().toArray(), [], []);
  const [pre, setPre] = useState<{ at: number; fromSchema: number }[]>([]);
  const [confirm, setConfirm] = useState<number | null>(null);
  const { run } = useAsync();
  useEffect(() => { listPreMigrationBackups().then((x) => setPre(x.map(({ at, fromSchema }) => ({ at, fromSchema })))).catch(() => {}); }, []);
  return (
    <Card title={<><Icon name="cloud" />{t('localBackups')}</>} actions={<button className="btn sm" onClick={() => run(() => saveLocalBackup('manual'), t('saved'))} data-testid="backup-now">{t('backupNow')}</button>}>
      <ul className="list" data-testid="local-backups">
        {list.map((b) => (
          <li key={b.id}>
            <span className="grow small">{d(new Date(b.at).toISOString().slice(0, 10))} {new Date(b.at).toLocaleTimeString()} · {t('backupReason_' + b.reason.replace(/-/g, '_'))} · {Math.round(b.size / 1024)} KB</span>
            <button className="btn sm" onClick={() => setConfirm(b.id!)}>{t('restore')}</button>
          </li>
        ))}
        {!list.length && <li className="empty">—</li>}
      </ul>
      {pre.length > 0 && <div className="tiny muted">{t('preMigration')}: {pre.map((p) => `${d(new Date(p.at).toISOString().slice(0, 10))} (v${p.fromSchema})`).join(', ')}</div>}
      {confirm !== null && <Confirm message={t('confirmRestoreLocal')} onNo={() => setConfirm(null)} onYes={async () => {
        const id = confirm; setConfirm(null);
        const c = await run(() => restoreLocalBackup(id));
        if (c) alertOk(t('restoreDone', { n: Object.values(c).reduce((a, b) => a + b, 0) }));
      }} />}
    </Card>
  );
}

/** Phone-friendly helper: copy the backend files with one tap (no computer needed). */
function BackendHelper() {
  const { t, toast } = useApp();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('copiedClipboard'));
    } catch {
      toast(t('error'));
    }
  };
  return (
    <div className="stat" data-testid="backend-helper">
      <div className="small bold">{t('backendSetup')}</div>
      <div className="tiny muted" style={{ marginBottom: 6 }}>{t('backendSetupHint')}</div>
      <div className="row wrap">
        <button className="btn sm" onClick={() => copy(backendCode)} data-testid="copy-code"><Icon name="clipboard" /> Code.gs</button>
        <button className="btn sm" onClick={() => copy(backendManifest)} data-testid="copy-manifest"><Icon name="clipboard" /> appsscript.json</button>
        <a className="btn sm" href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">↗ script.google.com</a>
      </div>
    </div>
  );
}

/** Attribution for every food photo shown in the app (required by the CC BY / CC BY-SA licences). */
function PhotoCredits() {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<[string, PhotoCredit][]>([]);
  useEffect(() => { if (open) loadPhotoManifest().then((m) => setList(Object.entries(m).sort())); }, [open]);
  return (
    <Card title={<><Icon name="image" />{t('photoCredits')}</>} actions={<button className="btn sm ghost" onClick={() => setOpen(!open)} data-testid="photo-credits-toggle">{open ? t('close') : t('show')}</button>}>
      <div className="tiny muted">{t('photoCreditsNote')}</div>
      {open && (
        <ul className="list credits" data-testid="photo-credits">
          {list.map(([key, c]) => (
            <li key={key}>
              <FoodThumb photoKey={key} size={40} />
              <div className="grow" style={{ minWidth: 0 }} dir="ltr">
                <a className="small bold" href={c.source} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{c.title}</a>
                <div className="tiny muted">{c.author} · {c.licenseUrl ? <a href={c.licenseUrl} target="_blank" rel="noreferrer">{c.license}</a> : c.license}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
