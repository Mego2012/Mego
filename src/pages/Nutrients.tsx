/** Nutrition details: vitamins, minerals and fat / carbohydrate details for one day, against reference intakes. */
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { Card, DateNav, NumField, Sheet, useAsync } from '../components/ui';
import { Icon } from '../components/icons';
import { today } from '../lib/dates';
import { db } from '../lib/db';
import { referenceFor } from '../lib/dri';
import { MICRO_GROUPS, microStatus, type MicroKey, type MicroRow } from '../lib/micros';
import { summarizeDay } from '../lib/reports';
import { saveSettings } from '../lib/repo';
import { targetsFor } from '../lib/targets';

export default function Nutrients() {
  const { t, settings } = useApp();
  const [date, setDate] = useState(today());
  const [edit, setEdit] = useState<MicroKey | null>(null);
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).toArray(), [date]);
  const log = useLiveQuery(() => db.days.get(date), [date]);
  const rows = useMemo(() => {
    if (!entries) return null;
    const day = summarizeDay(date, entries, log, settings);
    const kcal = targetsFor(date, settings, log).kcal;
    return microStatus(day.totals.micro, day.microCoverage, day.entryCount, (k) => referenceFor(k, settings.profile.sex, settings.profile.age, kcal), settings.microTargets);
  }, [entries, log, settings, date]);
  const byKey = new Map((rows ?? []).map((r) => [r.key, r]));
  return (
    <div className="page stack" data-testid="nutrients-page">
      <DateNav date={date} onChange={setDate} testId="nut-date" />
      <div className="banner info small" data-testid="nut-note">{t('nut_note')}</div>
      {rows && rows[0].entries === 0 && <div className="small muted" data-testid="nut-empty">{t('nut_empty')}</div>}
      {MICRO_GROUPS.map((g) => (
        <Card key={g.key} title={<><Icon name="leaf" />{t('nut_g_' + g.key)}</>}>
          <div className="nut-list" data-testid={'nut-group-' + g.key}>
            {g.items.map((k) => byKey.get(k)).filter(Boolean).map((r) => <NutRow key={r!.key} r={r!} onEdit={() => setEdit(r!.key)} />)}
          </div>
        </Card>
      ))}
      <div className="tiny muted" data-testid="nut-sources">{t('nut_sources')}</div>
      {edit && <TargetSheet k={edit} row={byKey.get(edit)!} onClose={() => setEdit(null)} />}
    </div>
  );
}

function NutRow({ r, onEdit }: { r: MicroRow; onEdit: () => void }) {
  const { t, n } = useApp();
  const dec = r.unit === 'g' ? 1 : r.consumed < 10 ? 2 : 0;
  const pct = r.pct ?? 0;
  const noData = r.entries > 0 && r.known === 0;
  return (
    <div className="nut-row" data-testid="nut-row" data-key={r.key}>
      <div className="nut-head">
        <span className="small bold">{t('nut_' + r.key)}</span>
        <span className="num small" data-testid="nut-val">
          {noData || r.entries === 0 ? '—' : <b>{n(r.consumed, dec)}</b>}
          {r.target !== undefined && <> / {n(r.target, r.target < 10 ? 1 : 0)}</>} {t('unit_' + (r.unit === 'µg' ? 'ug' : r.unit))}
        </span>
      </div>
      {r.target !== undefined && r.kind !== 'none' && (
        <div className={`gauge ${r.kind === 'limit' && pct > 100 ? 'over' : ''}`} role="progressbar" aria-label={t('nut_' + r.key)} aria-valuenow={pct}>
          <i style={{ width: `${Math.min(100, noData ? 0 : pct)}%`, background: 'var(--primary)' }} />
        </div>
      )}
      <div className="tiny muted num nut-meta">
        {r.target !== undefined && r.kind !== 'none' && !noData && r.entries > 0 && <span>{t('nut_pct', { pct: n(pct) })}</span>}
        {r.remaining !== undefined && r.remaining > 0 && !noData && r.entries > 0 && <span>{t('nut_remaining', { v: n(r.remaining, dec), u: t('unit_' + (r.unit === 'µg' ? 'ug' : r.unit)) })}</span>}
        {r.target !== undefined && <span>{t(r.custom ? 'nut_custom' : 'nut_kind_' + r.kind)}</span>}
        {r.kind === 'none' && <span>{t('nut_noTarget')}</span>}
        {r.entries > 0 && !r.complete && <span data-testid="nut-partial">{noData ? t('nut_noData') : t('nut_partial', { k: n(r.known), n: n(r.entries) })}</span>}
        {r.ul !== undefined && <span data-testid="nut-ul">{t(r.ulScope === 'total' ? 'nut_ul' : 'nut_ulSupp', { v: n(r.ul), u: t('unit_' + (r.unit === 'µg' ? 'ug' : r.unit)) })}</span>}
        {(r.kind === 'RDA' || r.kind === 'AI' || r.custom) && <button className="link-btn tiny" onClick={onEdit} data-testid="nut-edit">{t('nut_edit')}</button>}
      </div>
      {r.aboveUl && <div className="tiny delta pos" data-testid="nut-above-ul">{t('nut_aboveUl')}</div>}
    </div>
  );
}

function TargetSheet({ k, row, onClose }: { k: MicroKey; row: MicroRow; onClose: () => void }) {
  const { t, settings } = useApp();
  const { run } = useAsync();
  const [v, setV] = useState<number | ''>(settings.microTargets?.[k] ?? row.target ?? '');
  const save = (val: number | undefined) => run(async () => { await saveSettings((s) => { const m = { ...(s.microTargets ?? {}) }; if (val === undefined) delete m[k]; else m[k] = val; s.microTargets = m; }); onClose(); });
  return (
    <Sheet title={t('nut_' + k)} onClose={onClose} footer={<>
      <button className="btn" onClick={() => save(undefined)} data-testid="nut-reset">{t('nut_resetRef')}</button>
      <button className="btn primary" disabled={!(Number(v) > 0)} onClick={() => save(Number(v))} data-testid="nut-save">{t('save')}</button>
    </>}>
      <NumField label={t('nut_target')} value={v} onChange={setV} testId="nut-target-input" />
      <div className="tiny muted">{t('nut_targetNote')}</div>
    </Sheet>
  );
}
