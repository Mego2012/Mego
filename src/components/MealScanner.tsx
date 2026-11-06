import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { db } from '../lib/db';
import { isValidISODate, today } from '../lib/dates';
import {
  blockers, buildCatalog, COOKING_METHODS, itemNutrition, logScannedMeal, mealTotals, needsConfirmation, prepareImage, requestAnalysis,
  ScanError, suggestFoods, toScanItems, LOW_CONFIDENCE, type AiResult, type CookingMethod, type ScanItem
} from '../lib/mealScanner';
import { archiveFood, deleteEntries, displayName, uid } from '../lib/repo';
import { MEALS, type Food, type FoodState, type MealType } from '../lib/types';
import { FoodPicker } from './FoodPicker';
import { MacroLine, Segmented, Sheet, StateChip } from './ui';

/** Meal suggested from the time of day (the user can change it before saving). */
export function mealForNow(d = new Date()): MealType {
  const h = d.getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 18 && h < 23) return 'dinner';
  return 'snacks';
}

/** "Take a photo" + "Upload from gallery" buttons; opens the scanner sheet with the chosen picture. */
export function ScanButtons({ date, meal, compact }: { date?: string; meal?: MealType; compact?: boolean }) {
  const { t } = useApp();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setFile(f);
  };
  return (
    <>
      <div className={`scan-buttons${compact ? ' compact' : ''}`} data-testid="scan-buttons">
        <button className="btn primary grow" onClick={() => camRef.current?.click()} data-testid="scan-camera">📷 {t('scanTakePhoto')}</button>
        <button className="btn grow" onClick={() => galRef.current?.click()} data-testid="scan-gallery">🖼️ {t('scanFromGallery')}</button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} data-testid="scan-camera-input" />
      <input ref={galRef} type="file" accept="image/*" hidden onChange={pick} data-testid="scan-gallery-input" />
      {file && <MealScannerSheet file={file} date={date} meal={meal} onClose={() => setFile(null)} onReplace={(f) => setFile(f)} />}
    </>
  );
}

type Stage = 'ready' | 'preparing' | 'analyzing' | 'review' | 'error';

export function MealScannerSheet({ file, date: initialDate, meal: initialMeal, onClose, onReplace }: {
  file: File; date?: string; meal?: MealType; onClose: () => void; onReplace: (f: File) => void;
}) {
  const { t, lang, n, toast } = useApp();
  const foods = useLiveQuery(() => db.foods.toArray(), [], [] as Food[]);
  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const [stage, setStage] = useState<Stage>('ready');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<AiResult | null>(null);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [meal, setMeal] = useState<MealType>(initialMeal ?? mealForNow());
  const [date, setDate] = useState(initialDate && isValidISODate(initialDate) ? initialDate : today());
  const [picking, setPicking] = useState<{ itemId?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState('');
  const runId = useRef(0);
  const replaceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    setStage('ready');
    setItems([]);
    setResult(null);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const analyze = async () => {
    const id = ++runId.current;
    setError('');
    try {
      setStage('preparing');
      const img = await prepareImage(file);
      if (id !== runId.current) return;
      setStage('analyzing');
      const catalog = buildCatalog(foods);
      const res = await requestAnalysis(img.base64, catalog, { lang, note });
      if (id !== runId.current) return;
      setResult(res);
      setItems(toScanItems(res, catalog, foods));
      setStage('review');
    } catch (e) {
      if (id !== runId.current) return;
      const code = e instanceof ScanError ? e.code : (e as Error).message;
      setError(t(code) !== code ? code : 'AI_ERROR');
      setStage('error');
    }
  };
  const cancel = () => { runId.current++; setStage('ready'); };

  const update = (id: string, change: Partial<ScanItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));
  const remove = (id: string) => setItems((list) => list.filter((i) => i.id !== id));

  const onPickFood = (f: Food) => {
    if (picking?.itemId) {
      update(picking.itemId, { foodId: f.id, state: f.state, addAsNew: false, flags: [], confirmed: true });
    } else {
      setItems((list) => [...list, {
        id: uid(), nameAr: f.nameAr, nameEn: f.nameEn, foodId: f.id, grams: f.pieceGrams && f.pieceGrams > 0 ? f.pieceGrams : 100, gramsLow: 0, gramsHigh: 0,
        state: f.state, method: 'none', kind: 'food', confidence: 1, reason: '', flags: [], confirmed: true, addAsNew: false, origin: 'user'
      }]);
    }
    setPicking(null);
  };

  const totals = mealTotals(items, foodsById);
  const blocks = blockers(items);
  const save = async () => {
    setSaving(true);
    try {
      const r = await logScannedMeal(date, meal, items);
      toast(t('scanSaved', { n: r.entries.length }), {
        label: t('undo'),
        run: async () => {
          await deleteEntries(r.entries.map((e) => e.id));
          for (const f of r.createdFoods) await archiveFood(f.id);
          toast(t('scanUndone'));
        }
      });
      onClose();
    } catch (e) {
      toast(`${t('error')}: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const title = `📷 ${t('scanTitle')}`;
  const blockReasons = [...new Set(blocks.map((b) => b.reason))];

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="scan-preview">
        {url && <img src={url} alt="" data-testid="scan-preview" />}
      </div>
      <input ref={replaceRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onReplace(f); }} />

      {(stage === 'ready' || stage === 'error') && (
        <div className="stack" style={{ gap: 10 }}>
          {stage === 'error' && <div className="notice warn" role="alert" data-testid="scan-error">{t(error)}</div>}
          <label className="field">
            <span className="small muted">{t('scanNote')}</span>
            <input className="input" value={note} maxLength={300} placeholder={t('scanNotePh')} onChange={(e) => setNote(e.target.value)} data-testid="scan-note" />
          </label>
          <div className="tiny muted">{t('scanPrivacy')}</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => replaceRef.current?.click()}>{t('scanChangePhoto')}</button>
            <button className="btn primary grow" onClick={analyze} data-testid="scan-analyze">{stage === 'error' ? t('scanRetry') : t('scanAnalyze')}</button>
          </div>
        </div>
      )}

      {(stage === 'preparing' || stage === 'analyzing') && (
        <div className="stack center" style={{ gap: 10, padding: '18px 0' }} data-testid="scan-busy" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <div className="small">{stage === 'preparing' ? t('scanPreparing') : t('scanAnalyzing')}</div>
          <button className="btn sm ghost" onClick={cancel}>{t('scanCancel')}</button>
        </div>
      )}

      {stage === 'review' && result && (
        <div data-testid="scan-review">
          {!result.is_food && !items.length && <div className="notice warn" data-testid="scan-notfood">{t('scanNotFood')}</div>}
          {(result.meal_name_ar || result.meal_name_en) && (
            <div className="small" style={{ marginBottom: 4 }}><span className="muted">{t('scanMealName')}: </span><b data-testid="scan-meal-name">{lang === 'ar' ? result.meal_name_ar || result.meal_name_en : result.meal_name_en || result.meal_name_ar}</b></div>
          )}
          {result.notes && <div className="tiny muted" style={{ marginBottom: 6 }}>{result.notes}</div>}
          <div className="tiny muted" style={{ marginBottom: 8 }}>{t('scanWeightNote')}</div>

          <h3 className="small bold" style={{ margin: '8px 0' }}>{t('scanItems', { n: items.length })}</h3>
          {!items.length && <div className="tiny muted">{t('scanNoItems')}</div>}
          <div className="stack" style={{ gap: 10 }}>
            {items.map((i) => (
              <ScanItemCard key={i.id} item={i} foods={foods} foodsById={foodsById}
                onChange={(c) => update(i.id, c)} onRemove={() => remove(i.id)} onChoose={() => setPicking({ itemId: i.id })} />
            ))}
          </div>
          <button className="btn block" style={{ marginTop: 10 }} onClick={() => setPicking({})} data-testid="scan-add-ingredient">+ {t('scanAddIngredient')}</button>

          <div className="scan-total" data-testid="scan-total">
            <div className="row between">
              <b>{t('scanTotal')}</b>
              <b className="num" data-testid="scan-total-kcal">{n(totals.total.kcal)} {t('kcalUnit')}</b>
            </div>
            <MacroLine m={totals.total} />
            {totals.hasEstimates && <div className="tiny" style={{ color: 'var(--warn)' }}>⚠ {t('scanHasEstimates')}</div>}
          </div>

          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            <span className="small muted">{t('scanSaveTo')}</span>
            <Segmented value={meal} options={MEALS.map((m) => ({ value: m, label: t(m) }))} onChange={setMeal} />
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('date')} data-testid="scan-date" />
            {blockReasons.length > 0 && (
              <ul className="tiny" style={{ color: 'var(--warn)', margin: 0, paddingInlineStart: 18 }} data-testid="scan-blockers">
                {blockReasons.map((r) => <li key={r}>{t('block_' + r)}</li>)}
              </ul>
            )}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => replaceRef.current?.click()}>{t('scanChangePhoto')}</button>
              <button className="btn primary grow" disabled={saving || blocks.length > 0 || !isValidISODate(date)} onClick={save} data-testid="scan-save">✓ {t('scanConfirmSave')}</button>
            </div>
          </div>
        </div>
      )}

      {picking && (
        <Sheet title={picking.itemId ? t('scanChooseFood') : t('scanAddIngredient')} onClose={() => setPicking(null)}>
          <FoodPicker onPickFood={onPickFood} />
        </Sheet>
      )}
    </Sheet>
  );
}

function confLevel(c: number): 'high' | 'medium' | 'low' {
  return c >= 0.8 ? 'high' : c >= LOW_CONFIDENCE ? 'medium' : 'low';
}

function ScanItemCard({ item: i, foods, foodsById, onChange, onRemove, onChoose }: {
  item: ScanItem; foods: Food[]; foodsById: Map<string, Food>; onChange: (c: Partial<ScanItem>) => void; onRemove: () => void; onChoose: () => void;
}) {
  const { t, lang, n } = useApp();
  const f = i.foodId ? foodsById.get(i.foodId) : undefined;
  const nut = itemNutrition(i, foodsById);
  const must = needsConfirmation(i);
  const level = confLevel(i.confidence);
  const sugg = !f ? suggestFoods(i, foods) : [];
  const [gramsText, setGramsText] = useState(String(i.grams));
  useEffect(() => { if (Number(gramsText) !== i.grams) setGramsText(String(i.grams)); }, [i.grams]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`scan-item${must && !i.confirmed ? ' attention' : ''}`} data-testid="scan-item">
      <div className="row between" style={{ gap: 6, alignItems: 'flex-start' }}>
        <div className="grow" style={{ minWidth: 0 }}>
          {f ? (
            <div className="row wrap" style={{ gap: 6 }}>
              <b className="ellipsis" data-testid="scan-item-name">{displayName(f, lang)}</b>
              {f.state !== 'other' && <StateChip state={f.state} />}
            </div>
          ) : (
            <input className="input" value={lang === 'ar' ? i.nameAr : i.nameEn} aria-label={t('name')}
              onChange={(e) => onChange(lang === 'ar' ? { nameAr: e.target.value } : { nameEn: e.target.value })} data-testid="scan-item-name-input" />
          )}
          <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
            {f ? <span className="chip good" data-testid="scan-item-db">✓ {t('scanFromDb')}</span> : <span className="chip warn" data-testid="scan-item-est">⚠ {t('scanEstimate')}</span>}
            {i.origin === 'ai' && <span className={`chip ${level === 'high' ? 'good' : level === 'medium' ? '' : 'warn'}`} data-testid="scan-item-conf">{t('scanConfidence')}: {t('conf_' + level)} ({Math.round(i.confidence * 100)}%)</span>}
          </div>
        </div>
        <button className="btn sm danger" onClick={onRemove} aria-label={t('scanRemove')} data-testid="scan-item-remove">✕</button>
      </div>

      {i.flags.filter((x) => x === 'stateMismatch' || x === 'hiddenFat' || x === 'badKey').map((x) => <div key={x} className="tiny" style={{ color: 'var(--warn)', marginTop: 4 }}>⚠ {t('flag_' + x)}</div>)}
      {i.reason && <div className="tiny muted" style={{ marginTop: 4 }}>{i.reason}</div>}

      <div className="grid2" style={{ marginTop: 8, gap: 8 }}>
        <label className="field">
          <span className="tiny muted">{t('g')}</span>
          <input className="input num" inputMode="decimal" value={gramsText} data-testid="scan-item-grams"
            onChange={(e) => { setGramsText(e.target.value); const v = Number(e.target.value.replace(',', '.')); onChange({ grams: Number.isFinite(v) ? v : 0 }); }} />
        </label>
        <label className="field">
          <span className="tiny muted">{t('scanMethod')}</span>
          <select className="input" value={i.method} onChange={(e) => onChange({ method: e.target.value as CookingMethod })} data-testid="scan-item-method">
            {COOKING_METHODS.map((m) => <option key={m} value={m}>{t('method_' + m)}</option>)}
          </select>
        </label>
      </div>
      {i.origin === 'ai' && i.gramsHigh > i.gramsLow && <div className="tiny muted" style={{ marginTop: 4 }}>{t('scanRange', { lo: n(i.gramsLow), hi: n(i.gramsHigh) })}</div>}
      {!f && (
        <label className="field" style={{ marginTop: 6 }}>
          <span className="tiny muted">{t('scanState')}</span>
          <select className="input" value={i.state} onChange={(e) => onChange({ state: e.target.value as FoodState })}>
            {(['raw', 'cooked', 'other'] as const).map((s) => <option key={s} value={s}>{t('state_' + s)}</option>)}
          </select>
        </label>
      )}
      {f && i.method !== 'none' && i.method !== 'unknown' && <div className="tiny muted" style={{ marginTop: 4 }}>{t('scanMethodHint')}</div>}

      <div className="row between" style={{ marginTop: 8 }}>
        <span className="tiny"><MacroLine m={nut.macros} compact /></span>
        <b className="num" data-testid="scan-item-kcal">{nut.available ? `${nut.estimated ? '~' : ''}${n(nut.macros.kcal)}` : '—'}</b>
      </div>

      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn sm" onClick={onChoose} data-testid="scan-item-choose">{f ? t('scanChangeFood') : t('scanChooseFood')}</button>
      </div>
      {!f && sugg.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
          <span className="tiny muted">{t('scanSuggestions')}</span>
          {sugg.map((s) => (
            <button key={s.id} className="chip clickable" onClick={() => onChange({ foodId: s.id, state: s.state, addAsNew: false, flags: i.flags.filter((x) => x === 'lowConfidence'), confirmed: true })} data-testid="scan-item-suggestion">
              {displayName(s, lang)}{s.state !== 'other' ? ` · ${t('state_' + s.state)}` : ''}
            </button>
          ))}
        </div>
      )}
      {!f && (i.estPer100 ? (
        <label className="check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={i.addAsNew} onChange={(e) => onChange({ addAsNew: e.target.checked })} data-testid="scan-item-addnew" />
          <span className="small">{t('scanAddAsNew')} <span className="tiny muted num">({n(i.estPer100.kcal)} {t('kcalUnit')}/100{t('g')})</span></span>
        </label>
      ) : <div className="tiny" style={{ color: 'var(--warn)', marginTop: 6 }}>{t('scanAddAsNewNeedsValues')}</div>)}
      {must && (
        <label className={`check${i.confirmed ? '' : ' attention-text'}`} style={{ marginTop: 8 }}>
          <input type="checkbox" checked={i.confirmed} onChange={(e) => onChange({ confirmed: e.target.checked })} data-testid="scan-item-confirm" />
          <span className="small">{i.confirmed ? t('scanChecked') : `${t('scanChecked')} — ${t('scanMustCheck')}`}</span>
        </label>
      )}
    </div>
  );
}
