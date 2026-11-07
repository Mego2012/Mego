import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { Icon } from '../components/icons';
import { FoodThumb } from '../components/FoodThumb';
import { MacroSplit, SourceTag } from '../components/FoodPicker';
import { Card, Confirm, MacroLine, NumField, Sheet, StateChip, TextField, useAsync } from '../components/ui';
import { db } from '../lib/db';
import { exportFoodsCSV, exportFoodsXLSX } from '../lib/exporters';
import { exportCustomFoods, importCustomFoods } from '../lib/customFoods';
import { explainEnergy, isEnergySuspicious, round } from '../lib/nutrition';
import { archiveFood, createFood, displayName, restoreFood, toggleFavoriteFood, uid, updateFood } from '../lib/repo';
import { filterFoods, type FoodFilter } from '../lib/search';
import { saveLocalBackup } from '../lib/localBackup';
import { auditFoods, importParsedFoods, parseCSV, parseFoodRows, parseWorkbook, type ParsedFood } from '../lib/sheetImport';
import type { CustomServing, Food, FoodChange, FoodState } from '../lib/types';

export default function Foods() {
  const { t, n, lang, toast } = useApp();
  const foods = useLiveQuery(() => db.foods.toArray(), [], []);
  const [f, setF] = useState<FoodFilter>({ q: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  const [importing, setImporting] = useState<{ foods: ParsedFood[]; source: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { run } = useAsync();
  const categories = useMemo(() => [...new Set(foods.map((x) => x.category).filter(Boolean))].sort(), [foods]);
  const list = useMemo(() => filterFoods(foods, f).sort((a, b) => (f.q ? 0 : displayName(a, lang).localeCompare(displayName(b, lang), lang))), [foods, f, lang]);
  const active = foods.filter((x) => !x.archived);
  const issues = {
    incomplete: active.filter((x) => x.incomplete).length,
    energy: active.filter((x) => !x.incomplete && isEnergySuspicious(x.per100, x.category)).length,
    flagged: active.filter((x) => /⚠|غير محقق|تقريبي|تقديري|للمراجعة/.test(x.notes)).length
  };

  const onFile = async (file: File) => {
    await run(async () => {
      const isCsv = /\.csv$/i.test(file.name) || file.type.includes('csv');
      const rows = isCsv ? parseCSV(await file.text()) : (await parseWorkbook(await file.arrayBuffer())).rows;
      const parsed = parseFoodRows(rows);
      if (parsed.errors.length) throw new Error(parsed.errors.join(', '));
      setImporting({ foods: parsed.foods, source: file.name });
    });
  };

  return (
    <div data-testid="foods-page">
      <div className="picker-tools" style={{ marginBottom: 10 }}>
        <div className="grow search-field">
          <Icon name="search" />
          <input className="input" placeholder={t('search') + '…'} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} data-testid="foods-search" />
        </div>
        <button className={`icon-btn ${showFilters ? 'on' : ''}`} onClick={() => setShowFilters((x) => !x)} aria-label={t('filters')} aria-pressed={showFilters}><Icon name="filter" /></button>
        <button className="btn primary" onClick={() => setEditing('new')} data-testid="new-food"><Icon name="plus" /> {t('newFood')}</button>
      </div>
      <div className="tool-row cat-row">
        <button className={`chip clickable ${!f.category && !f.favoritesOnly ? 'on' : ''}`} onClick={() => setF({ ...f, category: '', favoritesOnly: false })}>{t('all')}</button>
        <button className={`chip clickable ${f.favoritesOnly ? 'on' : ''}`} onClick={() => setF({ ...f, favoritesOnly: !f.favoritesOnly })}><Icon name="star" filled={!!f.favoritesOnly} /> {t('favorites')}</button>
        {categories.slice(0, 24).map((c) => <button key={c} className={`chip clickable ${f.category === c ? 'on' : ''}`} onClick={() => setF({ ...f, category: f.category === c ? '' : c })}>{c}</button>)}
      </div>
      <Card className="filters-card">
        {showFilters && (
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="grid2">
              <label className="field"><span>{t('category')}</span>
                <select className="input" value={f.category ?? ''} onChange={(e) => setF({ ...f, category: e.target.value })}>
                  <option value="">{t('all')}</option>{categories.map((c) => <option key={c}>{c}</option>)}
                </select></label>
              <label className="field"><span>{t('state')}</span>
                <select className="input" value={f.state ?? ''} onChange={(e) => setF({ ...f, state: e.target.value as FoodState | '' })} data-testid="foods-state">
                  <option value="">{t('all')}</option><option value="raw">{t('state_raw')}</option><option value="cooked">{t('state_cooked')}</option><option value="other">{t('state_other')}</option>
                </select></label>
              <NumField label={t('maxKcal')} value={f.maxKcal} onChange={(v) => setF({ ...f, maxKcal: v })} />
              <NumField label={t('minProtein')} value={f.minProtein} onChange={(v) => setF({ ...f, minProtein: v })} />
              <NumField label={t('maxCarbs')} value={f.maxCarbs} onChange={(v) => setF({ ...f, maxCarbs: v })} />
              <NumField label={t('maxFat')} value={f.maxFat} onChange={(v) => setF({ ...f, maxFat: v })} />
            </div>
            <div className="row wrap">
              <label className="check"><input type="checkbox" checked={!!f.favoritesOnly} onChange={(e) => setF({ ...f, favoritesOnly: e.target.checked })} />{t('favorites')}</label>
              <label className="check"><input type="checkbox" checked={!!f.includeArchived} onChange={(e) => setF({ ...f, includeArchived: e.target.checked })} />{t('showArchived')}</label>
            </div>
          </div>
        )}
        <div className="tiny muted" data-testid="foods-count">{t('foodCount', { n: list.length })} / {active.length}</div>
      </Card>

      <Card className="list-card">
        <ul className="list" data-testid="foods-list">
          {list.slice(0, 300).map((x) => (
            <li key={x.id} className="clickable food-row" onClick={() => setEditing(x)} data-testid="food-row">
              <FoodThumb food={x} size={48} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="fr-name bold ellipsis">{displayName(x, lang)}</span>
                  <StateChip state={x.state} label={x.stateLabel} />
                  {x.archived && <span className="chip">{t('archived')}</span>}
                  {x.incomplete && <span className="chip warn">!</span>}
                </div>
                <MacroSplit m={x.per100} />
                <div className="tiny muted num ellipsis"><MacroLine m={x.per100} compact /> · <SourceTag source={x.source} />{x.category ? ` · ${x.category}` : ''}</div>
              </div>
              <div className="fr-kcal num">{n(x.per100.kcal)}<small>{t('kcalUnit')} / 100{t('g')}</small></div>
              <button className="icon-btn fr-fav" style={{ color: x.favorite ? 'var(--carbs)' : 'var(--faint)' }} onClick={(e) => { e.stopPropagation(); toggleFavoriteFood(x.id); }} aria-label={t('favorites')}><Icon name="star" filled={x.favorite} /></button>
            </li>
          ))}
          {!list.length && <li className="empty">{foods.length ? t('noResults') : t('importFile')}</li>}
        </ul>
      </Card>

      <Card title={t('issues')}>
        <div className="grid3 quality">
          <div className="stat"><div className="k">{t('issue_zeroValues')}</div><div className="v num">{issues.incomplete}</div></div>
          <div className="stat"><div className="k">{t('issue_energyMismatch')}</div><div className="v num">{issues.energy}</div></div>
          <div className="stat"><div className="k">{t('issue_flaggedInNotes')}</div><div className="v num">{issues.flagged}</div></div>
        </div>
      </Card>

      <Card title={t('importExport')}>
        <div className="io-grid">
          <button className="btn" onClick={() => fileRef.current?.click()} data-testid="import-file"><Icon name="upload" /> {t('importFile')}</button>
          <button className="btn" onClick={() => exportFoodsCSV(active)}><Icon name="download" /> {t('exportCSV')}</button>
          <button className="btn" onClick={() => exportFoodsXLSX(active)}><Icon name="download" /> {t('exportXLSX')}</button>
          <button className="btn" data-testid="export-my-foods" onClick={async () => {
            const blob = new Blob([await exportCustomFoods()], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mego-my-foods.json'; a.click(); URL.revokeObjectURL(a.href);
          }}><Icon name="download" /> {t('exportMyFoods')}</button>
          <label className="btn" data-testid="import-my-foods"><Icon name="upload" /> {t('importMyFoods')}
            <input type="file" accept=".json,application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              try { const r = await importCustomFoods(await f.text()); toast(t('importedFoods', { n: r.added })); } catch (err) { toast(`${t('error')}: ${(err as Error).message}`); }
            }} />
          </label>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" hidden data-testid="import-input"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ''; }} />
      </Card>

      {editing && <FoodEditor food={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {importing && <ImportPreview data={importing} onClose={() => setImporting(null)} />}
    </div>
  );
}

function ImportPreview({ data, onClose }: { data: { foods: ParsedFood[]; source: string }; onClose: () => void }) {
  const { t, toast } = useApp();
  const audit = auditFoods(data.foods);
  const { run, busy } = useAsync();
  const withIssues = data.foods.filter((f) => f.issues.length);
  return (
    <Sheet title={`${t('importPreview')} — ${data.source}`} onClose={onClose}
      footer={<button className="btn primary block" disabled={busy} data-testid="import-confirm" onClick={async () => {
        const r = await run(async () => { await saveLocalBackup('pre-import'); return importParsedFoods(data.foods, 'file'); });
        if (r) { toast(t('importDone', { added: r.added, updated: r.updated, unchanged: r.unchanged })); onClose(); }
      }}>{t('importNow')} ({audit.total})</button>}>
      <div className="stack" data-testid="import-preview">
        <div className="grid4">
          <div className="stat"><div className="k">{t('all')}</div><div className="v num">{audit.total}</div></div>
          <div className="stat"><div className="k">{t('state_raw')}</div><div className="v num">{audit.raw}</div></div>
          <div className="stat"><div className="k">{t('state_cooked')}</div><div className="v num">{audit.cooked}</div></div>
          <div className="stat"><div className="k">{t('state_other')}</div><div className="v num">{audit.other}</div></div>
        </div>
        <div className="small">
          {t('issue_zeroValues')}: <b>{audit.zeroValues}</b> · {t('issue_missingValues')}: <b>{audit.missingValues}</b> · {t('issue_decimalComma')}: <b>{audit.decimalComma}</b> · {t('issue_energyMismatch')}: <b>{audit.energyMismatch}</b> · {t('issue_duplicateName')}: <b>{audit.duplicates}</b> · {t('issue_flaggedInNotes')}: <b>{audit.flagged}</b>
        </div>
        <ul className="list">
          {withIssues.slice(0, 60).map((f) => (
            <li key={f.sheetKey}><div className="grow"><div className="bold small">{f.nameAr} <span className="tiny muted">#{f.row}</span></div>
              <div className="tiny muted">{f.issues.map((i) => t('issue_' + i)).join(' · ')}</div></div></li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

const STATE_LABEL_AR: Record<FoodState, string> = { raw: 'نيء', cooked: 'مطبوخ', other: '—' };

export function FoodEditor({ food, onClose, initialName, onSaved }: { food: Food | null; onClose: () => void; initialName?: string; onSaved?: (f: Food) => void }) {
  const { t, n, d, lang } = useApp();
  const [v, setV] = useState(() => ({
    nameAr: food?.nameAr ?? (initialName && /[\u0600-\u06FF]/.test(initialName) ? initialName : ''), nameEn: food?.nameEn ?? (initialName && !/[\u0600-\u06FF]/.test(initialName) ? initialName : ''), category: food?.category ?? '', state: food?.state ?? ('raw' as FoodState),
    stateLabel: food?.stateLabel ?? '', prep: food?.prep ?? '', notes: food?.notes ?? '',
    kcal: food?.per100.kcal ?? ('' as number | ''), protein: food?.per100.protein ?? ('' as number | ''), carbs: food?.per100.carbs ?? ('' as number | ''), fat: food?.per100.fat ?? ('' as number | ''),
    pieceGrams: food?.pieceGrams ?? ('' as number | ''), gramsPerMl: food?.gramsPerMl ?? ('' as number | ''), servings: food?.servings ?? ([] as CustomServing[]),
    fiber: food?.per100.fiber ?? ('' as number | ''), sugar: food?.per100.sugar ?? ('' as number | ''), sodium: food?.per100.sodium ?? ('' as number | ''),
    satFat: food?.per100.satFat ?? ('' as number | ''),
    /** How the numbers were typed: per 100 g, per 100 ml, or per serving (nutrition label) — converted to per 100 g on save. */
    basis: 'g100' as 'g100' | 'ml100' | 'serving', servingGrams: '' as number | '',
    barcode: food?.barcode ?? '', brand: food?.brand ?? ''
  }));
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<'edit' | 'history'>('edit');
  const history = useLiveQuery<FoodChange[], FoodChange[]>(async () => (food ? (await db.foodChanges.where('foodId').equals(food.id).sortBy('at')).reverse() : []), [food?.id], []);
  const { run, busy } = useAsync();
  // factor converts the typed values to per 100 g: per serving of S g → ×100/S; per 100 ml → ÷ density (g/ml, default 1)
  const density = v.gramsPerMl === '' ? 1 : Number(v.gramsPerMl) || 1;
  const factor = v.basis === 'serving' ? (Number(v.servingGrams) > 0 ? 100 / Number(v.servingGrams) : 0) : v.basis === 'ml100' ? 1 / density : 1;
  const conv = (x: number | '') => round((Number(x) || 0) * factor, 2);
  const per100: Food['per100'] = { kcal: conv(v.kcal), protein: conv(v.protein), carbs: conv(v.carbs), fat: conv(v.fat) };
  if (v.fiber !== '') per100.fiber = conv(v.fiber);
  if (v.sugar !== '') per100.sugar = conv(v.sugar);
  if (v.sodium !== '') per100.sodium = conv(v.sodium);
  if (v.satFat !== '') per100.satFat = conv(v.satFat);
  const calc = round(4 * per100.protein + 4 * per100.carbs + 9 * per100.fat, 0);
  const energy = explainEnergy(per100, v.category);
  const valid = (v.nameAr.trim() || v.nameEn.trim()) && v.kcal !== '' && v.protein !== '' && v.carbs !== '' && v.fat !== '' && factor > 0;

  const save = async () => {
    const payload = {
      nameAr: v.nameAr.trim(), nameEn: v.nameEn.trim(), category: v.category.trim(), state: v.state,
      stateLabel: food && food.state === v.state ? v.stateLabel : STATE_LABEL_AR[v.state], prep: v.prep, notes: v.notes, per100,
      pieceGrams: v.pieceGrams === '' ? undefined : Number(v.pieceGrams), gramsPerMl: v.gramsPerMl === '' ? undefined : Number(v.gramsPerMl),
      servings: [...v.servings.filter((s) => s.name && s.grams > 0),
        ...(v.basis === 'serving' && Number(v.servingGrams) > 0 && !v.servings.some((s) => s.grams === Number(v.servingGrams)) ? [{ id: uid(), name: t('labelServing'), grams: Number(v.servingGrams) }] : [])],
      barcode: v.barcode.trim() || undefined, brand: v.brand.trim() || undefined
    };
    const ok = await run(() => (food ? updateFood(food.id, payload) : createFood(payload)), t('saved'));
    if (ok) { onSaved?.(ok); onClose(); }
  };

  return (
    <Sheet title={food ? t('editFood') : t('newFood')} onClose={onClose}>
      {food && <div style={{ marginBottom: 10 }}><div className="segmented">
        <button className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>{t('edit')}</button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')} data-testid="food-history-tab">{t('history')} ({history.length})</button>
      </div></div>}
      {tab === 'history' && food ? (
        <ul className="list" data-testid="food-history">
          {history.map((h) => (
            <li key={h.id}><div className="grow">
              <div className="small bold">{t(h.action === 'sheet-update' ? 'source_sheet' : h.action === 'import' ? 'source_sheet' : 'edit')} · {h.action} · {d(new Date(h.at).toISOString().slice(0, 10))} {new Date(h.at).toLocaleTimeString()}</div>
              {h.before?.per100 && h.after?.per100 && <div className="tiny muted num">{n(h.before.per100.kcal)}/{n(h.before.per100.protein, 1)}/{n(h.before.per100.carbs, 1)}/{n(h.before.per100.fat, 1)} → {n(h.after.per100.kcal)}/{n(h.after.per100.protein, 1)}/{n(h.after.per100.carbs, 1)}/{n(h.after.per100.fat, 1)}</div>}
              {h.before && !h.before.per100 && <div className="tiny muted">{Object.keys(h.after ?? {}).join(', ')}</div>}
            </div></li>
          ))}
          <li className="tiny muted">{t('version')} {food.version} · {t(food.source === 'sheet' ? 'source_sheet' : 'source_custom')}{food.sheetRow ? ` #${food.sheetRow}` : ''}</li>
        </ul>
      ) : (
        <div className="stack" data-testid="food-editor">
          {food && (
            <div className="food-hero editor-hero">
              <FoodThumb food={food} size={64} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="fh-name">{displayName(food, lang)}</div>
                <div className="row wrap" style={{ gap: 6, marginTop: 2 }}><StateChip state={food.state} label={food.stateLabel} /><SourceTag source={food.source} />{food.sourceRef && <span className="tiny muted" dir="ltr">{food.sourceRef}</span>}</div>
                <MacroSplit m={food.per100} />
                <div className="tiny muted num">{n(food.per100.kcal)} {t('kcalUnit')} · <MacroLine m={food.per100} compact /> / 100 {t('g')}</div>
              </div>
            </div>
          )}
          <div className="grid2">
            <TextField label={t('nameAr')} value={v.nameAr} onChange={(x) => setV({ ...v, nameAr: x })} dir="rtl" testId="fe-nameAr" />
            <TextField label={t('nameEn')} value={v.nameEn} onChange={(x) => setV({ ...v, nameEn: x })} dir="ltr" testId="fe-nameEn" />
            <TextField label={t('category')} value={v.category} onChange={(x) => setV({ ...v, category: x })} />
            <label className="field"><span>{t('state')}</span>
              <select className="input" value={v.state} onChange={(e) => setV({ ...v, state: e.target.value as FoodState })} data-testid="fe-state">
                <option value="raw">{t('state_raw')}</option><option value="cooked">{t('state_cooked')}</option><option value="other">{t('state_other')}</option>
              </select></label>
          </div>
          <label className="field"><span>{t('valuesPer')}</span>
            <select className="input" value={v.basis} onChange={(e) => setV({ ...v, basis: e.target.value as typeof v.basis })} data-testid="fe-basis">
              <option value="g100">{t('per100')}</option>
              <option value="ml100">{t('per100ml')}</option>
              <option value="serving">{t('perServingLabel')}</option>
            </select></label>
          {v.basis === 'serving' && <NumField label={t('servingSizeG')} suffix={t('g')} value={v.servingGrams} onChange={(x) => setV({ ...v, servingGrams: x })} testId="fe-serving-g" />}
          {v.basis === 'ml100' && v.gramsPerMl === '' && <div className="tiny muted">{t('densityAssumed')}</div>}
          <div className="grid4">
            <NumField label={t('kcal')} value={v.kcal} onChange={(x) => setV({ ...v, kcal: x })} testId="fe-kcal" />
            <NumField label={t('protein')} value={v.protein} onChange={(x) => setV({ ...v, protein: x })} testId="fe-protein" />
            <NumField label={t('carbs')} value={v.carbs} onChange={(x) => setV({ ...v, carbs: x })} testId="fe-carbs" />
            <NumField label={t('fat')} value={v.fat} onChange={(x) => setV({ ...v, fat: x })} testId="fe-fat" />
          </div>
          {v.basis !== 'g100' && factor > 0 && <div className="tiny" data-testid="fe-converted">{t('convertedPer100')}: {per100.kcal} {t('kcalUnit')} · P {per100.protein} · C {per100.carbs} · F {per100.fat}</div>}
          <div className="tiny muted" data-testid="fe-energy">{t('energyCalc', { calc, kcal: per100.kcal })}</div>
          {energy && <div className={`tiny ${energy.reason === 'review' ? 'delta pos' : 'muted'}`} data-testid="fe-energy-explain">{t('energy_' + energy.reason, { pct: energy.pct })}</div>}
          <div className="small bold">{t('optionalNutrients')}</div>
          <div className="grid2">
            <NumField label={t('fiber')} suffix={t('g')} value={v.fiber} onChange={(x) => setV({ ...v, fiber: x })} testId="fe-fiber" />
            <NumField label={t('sugar')} suffix={t('g')} value={v.sugar} onChange={(x) => setV({ ...v, sugar: x })} />
            <NumField label={t('satFat')} suffix={t('g')} value={v.satFat} onChange={(x) => setV({ ...v, satFat: x })} testId="fe-satfat" />
            <NumField label={t('sodium')} suffix={t('mg')} value={v.sodium} onChange={(x) => setV({ ...v, sodium: x })} />
          </div>
          <div className="grid2">
            <NumField label={t('pieceWeight')} value={v.pieceGrams} onChange={(x) => setV({ ...v, pieceGrams: x })} testId="fe-piece" />
            <NumField label={t('density')} value={v.gramsPerMl} onChange={(x) => setV({ ...v, gramsPerMl: x })} />
          </div>
          <div className="small bold">{t('customServings')}</div>
          {v.servings.map((s, i) => (
            <div key={s.id} className="row">
              <input className="input grow" placeholder={t('servingName')} value={s.name} onChange={(e) => { const a = [...v.servings]; a[i] = { ...s, name: e.target.value }; setV({ ...v, servings: a }); }} />
              <input className="input num" style={{ width: 100 }} type="number" inputMode="decimal" placeholder={t('g')} value={s.grams || ''} onChange={(e) => { const a = [...v.servings]; a[i] = { ...s, grams: Number(e.target.value) }; setV({ ...v, servings: a }); }} />
              <button className="icon-btn" onClick={() => setV({ ...v, servings: v.servings.filter((x) => x.id !== s.id) })} aria-label={t('delete')}><Icon name="trash" /></button>
            </div>
          ))}
          <button className="btn sm" onClick={() => setV({ ...v, servings: [...v.servings, { id: uid(), name: '', grams: 0 }] })}>+ {t('addServing')}</button>
          <TextField label={t('prep')} value={v.prep} onChange={(x) => setV({ ...v, prep: x })} />
          <div className="grid2">
            <TextField label={t('barcode')} value={v.barcode} onChange={(x) => setV({ ...v, barcode: x.replace(/\D/g, '') })} dir="ltr" />
            <TextField label={t('brand')} value={v.brand} onChange={(x) => setV({ ...v, brand: x })} />
          </div>
          {food?.source === 'openfoodfacts' && <div className="banner info tiny">{t('externalSource')}</div>}
          {food?.sourceRef && <div className="tiny muted" data-testid="fe-source">{t('sourceLabel')}: {food.sourceRef}</div>}
          <label className="field"><span>{t('notes')}</span><textarea className="input" rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
          <button className="btn primary block" disabled={!valid || busy} onClick={save} data-testid="fe-save">{t('save')}</button>
          {food && !food.archived && food.source !== 'sheet' && <SubmitSharedButton food={food} />}
          {food && !food.archived && <button className="btn block" disabled={busy} data-testid="fe-duplicate" onClick={async () => {
            const copy = await run(() => createFood({ ...food, nameAr: food.nameAr ? food.nameAr + ' (2)' : '', nameEn: food.nameEn ? food.nameEn + ' (2)' : '', source: 'custom', sourceRef: undefined, sheetKey: undefined, sheetRow: undefined, servings: food.servings.map((x) => ({ ...x, id: uid() })) }, { allowDuplicate: true }), t('saved'));
            if (copy) onClose();
          }}><Icon name="copy" /> {t('duplicate')}</button>}
          {food && (food.archived
            ? <button className="btn block" onClick={async () => { await restoreFood(food.id); onClose(); }}>{t('restore')}</button>
            : <button className="btn danger block" onClick={() => setConfirm(true)} data-testid="fe-archive">{t('archive')}</button>)}
        </div>
      )}
      {confirm && food && <Confirm danger message={t('confirmArchive', { name: displayName(food) })} onNo={() => setConfirm(false)} onYes={async () => { await archiveFood(food.id); onClose(); }} />}
    </Sheet>
  );
}

/** Signed-in users can propose a personal food for the shared database (reviewed by an admin first). */
function SubmitSharedButton({ food }: { food: Food }) {
  const { t } = useApp();
  const { run } = useAsync();
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<string>('guest');
  useEffect(() => { import('../lib/account').then((m) => setMode(m.accountState().mode)); }, []);
  if (mode !== 'account') return null;
  return (
    <button className="btn block" disabled={done} data-testid="fe-submit-shared" onClick={() => run(async () => {
      const { submitFood } = await import('../lib/firebase');
      await submitFood({ nameAr: food.nameAr, nameEn: food.nameEn, category: food.category, per100: food.per100 as unknown as Record<string, number>, state: food.state, pieceGrams: food.pieceGrams, notes: food.notes, sourceRef: food.sourceRef });
      setDone(true);
    }, t('submittedShared'))}>{done ? '✓ ' + t('submittedShared') : t('submitShared')}</button>
  );
}
