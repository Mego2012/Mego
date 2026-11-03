import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useSyncStatus } from '../components/Layout';
import { Card, NumField, Segmented, TextField, useAsync } from '../components/ui';
import { backupToDrive, downloadBackup, restoreBackup } from '../lib/backup';
import { db } from '../lib/db';
import { exportDiaryCSV } from '../lib/exporters';
import { DICTS, WEEKDAY_KEYS } from '../lib/i18n';
import { bmr, macroCalories } from '../lib/targets';
import { saveSettings } from '../lib/repo';
import { pullAll, pullFoodsFromSheet, pushNow, queueFullUpload, testConnection } from '../lib/sync';
import type { Lang, Macros, Settings as S, ThemeMode } from '../lib/types';

export default function Settings() {
  const { settings } = useApp();
  return (
    <div data-testid="settings-page">
      <Preferences />
      <ProfileForm key={'p' + settings.updatedAt} />
      <TargetsForm key={'t' + settings.updatedAt} />
      <SyncForm />
      <DataSafety />
    </div>
  );
}

function Preferences() {
  const { t, settings } = useApp();
  return (
    <Card title={`${t('language')} · ${t('theme')}`}>
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
  const [p, setP] = useState(settings.profile);
  const { run } = useAsync();
  const num = (k: keyof S['profile']) => (v: number | '') => setP({ ...p, [k]: v === '' ? 0 : v });
  return (
    <Card title={t('profile')}>
      <div className="grid2">
        <label className="field"><span>{t('sex')}</span>
          <select className="input" value={p.sex} onChange={(e) => setP({ ...p, sex: e.target.value as 'male' | 'female' })}>
            <option value="male">{t('male')}</option><option value="female">{t('female')}</option></select></label>
        <NumField label={t('age')} value={p.age} onChange={num('age')} />
        <NumField label={t('height')} suffix={t('cm')} value={p.heightCm} onChange={num('heightCm')} />
        <NumField label={t('currentWeight')} suffix={t('kg')} value={p.currentWeight} onChange={num('currentWeight')} testId="profile-weight" />
        <NumField label={t('startWeight')} suffix={t('kg')} value={p.startWeight} onChange={num('startWeight')} />
        <NumField label={t('targetWeight')} suffix={t('kg')} value={p.targetWeight} onChange={num('targetWeight')} />
        <NumField label={t('weeklyChange')} value={p.weeklyChangeKg} onChange={num('weeklyChangeKg')} step="0.05" />
        <NumField label={t('trainingDaysPerWeek')} value={p.trainingDaysPerWeek} onChange={num('trainingDaysPerWeek')} />
      </div>
      <div style={{ marginTop: 10 }}><TextField label={t('goal')} value={p.goal} onChange={(v) => setP({ ...p, goal: v })} /></div>
      <div className="tiny muted" style={{ marginTop: 8 }}>{t('bmrRef')}: {n(bmr(p))} {t('kcalUnit')}</div>
      <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => run(() => saveSettings((s) => { s.profile = p; }), t('saved'))} data-testid="profile-save">{t('save')}</button>
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
  const [v, setV] = useState({ targets: settings.targets, trainingWeekdays: settings.trainingWeekdays, tolerance: settings.tolerance, autoCompletePastDays: settings.autoCompletePastDays, weekStartsOn: settings.weekStartsOn });
  const { run } = useAsync();
  return (
    <Card title={t('nutritionTargets')}>
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
        <button className="btn primary block" data-testid="targets-save" onClick={() => run(() => saveSettings((s) => { Object.assign(s, v); }), t('saved'))}>{t('save')}</button>
      </div>
    </Card>
  );
}

function SyncForm() {
  const { t, settings, d } = useApp();
  const [cfg, setCfg] = useState(settings.sync);
  useEffect(() => setCfg((c) => ({ ...settings.sync, url: c.url || settings.sync.url, token: c.token || settings.sync.token })), [settings.sync]);
  const status = useSyncStatus();
  const { run, busy } = useAsync();
  const saveCfg = () => saveSettings((s) => { s.sync = { ...s.sync, url: cfg.url.trim(), token: cfg.token.trim(), autoSync: cfg.autoSync, writeFoodsToSheet: cfg.writeFoodsToSheet }; });
  return (
    <Card title={<span id="sync">{t('syncTitle')}</span>}>
      <div className="stack" data-testid="sync-form">
        <div className="small"><span className={`dot ${status.state}`} /> {t('syncState_' + status.state)} · {t('pending')}: <b data-testid="pending-count">{status.pending}</b>
          {settings.sync.lastPushAt ? ` · ${t('lastSync')}: ${d(new Date(settings.sync.lastPushAt).toISOString().slice(0, 10))} ${new Date(settings.sync.lastPushAt).toLocaleTimeString()}` : ''}</div>
        {status.error && <div className="banner error small">{status.error}</div>}
        <TextField label={t('syncUrl')} value={cfg.url} onChange={(url) => setCfg({ ...cfg, url })} dir="ltr" placeholder="https://script.google.com/macros/s/…/exec" testId="sync-url" />
        <TextField label={t('syncToken')} value={cfg.token} onChange={(token) => setCfg({ ...cfg, token })} dir="ltr" testId="sync-token" />
        <label className="check"><input type="checkbox" checked={cfg.autoSync} onChange={(e) => setCfg({ ...cfg, autoSync: e.target.checked })} />{t('autoSync')}</label>
        <label className="check"><input type="checkbox" checked={cfg.writeFoodsToSheet} onChange={(e) => setCfg({ ...cfg, writeFoodsToSheet: e.target.checked })} />{t('writeFoods')}</label>
        <div className="row wrap">
          <button className="btn primary" disabled={busy} data-testid="sync-save" onClick={() => run(async () => { await saveCfg(); const r = await testConnection({ ...cfg }); return r; }).then((r) => r && alertOk(t('connectionOk', { name: r.spreadsheet, tab: r.foodSheet ?? '—' })))}>{t('save')} + {t('testConnection')}</button>
          <button className="btn" disabled={busy || !settings.sync.url} data-testid="pull-foods" onClick={() => run(async () => {
            const r = await pullFoodsFromSheet();
            alertOk(`${r.sheet}: ${t('importDone', { added: r.added, updated: r.updated, unchanged: r.unchanged })}`);
          })}>{t('pullFoods')}</button>
          <button className="btn" disabled={busy || !settings.sync.url} onClick={() => run(() => pushNow())} data-testid="push-now">{t('pushNow')}</button>
          <button className="btn" disabled={busy || !settings.sync.url} onClick={() => run(async () => { await queueFullUpload(); await pushNow(); }, t('saved'))}>{t('uploadAll')}</button>
          <button className="btn" disabled={busy || !settings.sync.url} onClick={() => run(async () => { const c = await pullAll(); alertOk(t('restoreDone', { n: Object.values(c).reduce((a, b) => a + b, 0) })); })}>{t('restoreFromSheet')}</button>
          <button className="btn" disabled={busy || !settings.sync.url} onClick={() => run(async () => { const r = await backupToDrive(); alertOk(r.file); })}>{t('backupDrive')}</button>
        </div>
        <a className="small" href="https://github.com/mego2012/mego/blob/claude/nutrition-tracking-app-989rku/docs/SETUP.md" target="_blank" rel="noreferrer">{t('setupGuide')} ↗</a>
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
    <Card title={t('dataSafety')}>
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
          const c = await run(async () => restoreBackup(await f.text()));
          if (c) alertOk(t('restoreDone', { n: Object.values(c).reduce((a, b) => a + b, 0) }));
        }} />
      </div>
    </Card>
  );
}
