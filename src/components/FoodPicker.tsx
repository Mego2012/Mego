import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { db } from '../lib/db';
import { availableUnits, basisFromFood, gramsPerUnit, macrosFor, UnitError } from '../lib/nutrition';
import { BarcodeSheet, ProductForm } from './BarcodeSheet';
import { FoodEditor } from '../pages/Foods';
import { loadRefFoods, materializeRefFood, refLoaded, searchRefFoods, type RefFood } from '../lib/refFoods';
import { searchOFF, type ExternalProduct } from '../lib/barcode';
import { displayName, toggleFavoriteFood } from '../lib/repo';
import { filterFoods } from '../lib/search';
import type { DiaryEntry, EntryBasis, Food, MealTemplate, Recipe, Unit } from '../lib/types';
import { Icon } from './icons';
import { FoodThumb } from './FoodThumb';
import { MacroLine, OptionalNutrientsLine, Segmented, Sheet, StateChip, useAsync } from './ui';

type Tab = 'search' | 'recent' | 'frequent' | 'favorites' | 'history' | 'meals' | 'recipes';

/** Unit <option>s that show what one unit weighs, e.g. "حبة (55 غ)", "كوب (240 غ)". */
export function UnitOptions({ basis, units }: { basis: EntryBasis; units: Unit[] }) {
  const { t, n } = useApp();
  return (
    <>
      {units.map((u) => {
        const g = u === 'g' || u === 'serving' ? null : gramsPerUnit(basis, u);
        return <option key={u} value={u}>{g ? t('unitWithGrams', { unit: t('unit_' + u), g: n(g, 1) }) : t('unit_' + u)}</option>;
      })}
    </>
  );
}

export function FoodPicker({ onPickFood, onPickRecipe, onPickTemplate, onPickHistory }: {
  onPickFood: (f: Food) => void;
  onPickRecipe?: (r: Recipe) => void;
  onPickTemplate?: (t: MealTemplate) => void;
  /** Re-log a past entry (same food & quantity, current food values). */
  onPickHistory?: (e: DiaryEntry) => void;
}) {
  const { t, lang, n, d } = useApp();
  const [tab, setTab] = useState<Tab>('search');
  const [scan, setScan] = useState(false);
  const history = useLiveQuery(async () => (tab === 'history' ? (await db.entries.orderBy('updatedAt').reverse().limit(600).toArray()) : []), [tab], []);
  const [q, setQ] = useState('');
  const [state, setState] = useState<'' | Food['state']>('');
  const foods = useLiveQuery(() => db.foods.toArray(), [], []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], []);
  const templates = useLiveQuery(() => db.templates.toArray(), [], []);

  const list = useMemo(() => {
    if (tab === 'recent') return foods.filter((f) => f.lastUsedAt && !f.archived).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).slice(0, 30);
    if (tab === 'frequent') return foods.filter((f) => (f.useCount ?? 0) > 0 && !f.archived).sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0)).slice(0, 30);
    if (tab === 'favorites') return filterFoods(foods, { favoritesOnly: true, q, state });
    return filterFoods(foods, { q, state }).slice(0, 80);
  }, [foods, tab, q, state]);

  // Shared reference database (USDA): loaded on first search, works offline after the first load.
  const [refState, setRefState] = useState<'idle' | 'loading' | 'ready' | 'error'>(refLoaded() ? 'ready' : 'idle');
  const searching = tab === 'search' && q.trim().length >= 2;
  useEffect(() => {
    if (!searching || refState !== 'idle') return;
    setRefState('loading');
    loadRefFoods().then(() => setRefState('ready')).catch(() => setRefState('error'));
  }, [searching, refState]);
  const refResults = useMemo(() => (searching && refState === 'ready' ? searchRefFoods(q, { state: state || undefined }, 30) : []), [q, state, searching, refState]);
  const [creating, setCreating] = useState(false);
  const [off, setOff] = useState<{ state: 'idle' | 'loading' | 'done' | 'error'; items: ExternalProduct[] }>({ state: 'idle', items: [] });
  const [offPick, setOffPick] = useState<ExternalProduct | null>(null);
  useEffect(() => setOff({ state: 'idle', items: [] }), [q]);
  const { run } = useAsync();
  const pickRef = async (rf: RefFood) => { const f = await run(() => materializeRefFood(rf)); if (f) onPickFood(f); };

  const tabs: { value: Tab; label: string }[] = [
    { value: 'search', label: t('all') },
    { value: 'recent', label: t('recent') },
    { value: 'frequent', label: t('frequent') },
    { value: 'favorites', label: t('favorites') }
  ];
  if (onPickHistory) tabs.push({ value: 'history', label: t('historyTab') });
  if (onPickTemplate) tabs.push({ value: 'meals', label: t('savedMeals') });
  if (onPickRecipe) tabs.push({ value: 'recipes', label: t('recipes') });

  return (
    <div className="stack">
      <div className="picker-tools">
        <div className="grow search-field">
          <Icon name="search" />
          <input className="input" autoFocus placeholder={tab === 'history' ? t('searchHistory') : t('search') + '…'} value={q}
            onChange={(e) => { setQ(e.target.value); if (tab !== 'search' && tab !== 'favorites' && tab !== 'history') setTab('search'); }} data-testid="food-search" />
        </div>
        <button className="icon-btn" onClick={() => setScan(true)} aria-label={t('scanBarcode')} title={t('scanBarcode')} data-testid="open-barcode">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round"><path d="M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2M7 9v6M10 9v6M13 9v6M16 9v6" /></svg>
        </button>
        <select className="chip-select" value={state} onChange={(e) => setState(e.target.value as Food['state'] | '')} aria-label={t('state')} data-testid="state-filter">
          <option value="">{t('all')}</option>
          <option value="raw">{t('state_raw')}</option>
          <option value="cooked">{t('state_cooked')}</option>
          <option value="other">{t('state_other')}</option>
        </select>
      </div>
      <Segmented value={tab} options={tabs} onChange={setTab} />
      {scan && <BarcodeSheet onClose={() => setScan(false)} onFood={(f) => { setScan(false); onPickFood(f); }} />}
      {tab === 'history' && onPickHistory && (
        <ul className="list" data-testid="history-results">
          {uniqueHistory(history, q).slice(0, 60).map((e) => (
            <li key={e.id} className="clickable" onClick={() => onPickHistory(e)} data-testid="history-option">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="bold ellipsis">{e.name}</div>
                <div className="tiny muted num">{n(e.quantity, 2)} {t('unit_' + e.unit)} · {n(e.macros.kcal)} {t('kcalUnit')} · {t('lastEaten', { date: d(e.date) })}</div>
              </div>
              <span className="chip">+</span>
            </li>
          ))}
          {!history.length && <li className="empty">{t('noResults')}</li>}
        </ul>
      )}
      {tab === 'meals' && onPickTemplate && (
        <ul className="list">
          {templates.filter((x) => !x.deleted).map((tp) => (
            <li key={tp.id} className="clickable" onClick={() => onPickTemplate(tp)} data-testid="pick-template">
              <div className="grow"><div className="bold">{tp.name}</div><div className="tiny muted">{tp.items.length} {t('items')}</div></div>
              <Icon name="plus" />
            </li>
          ))}
          {!templates.length && <li className="empty">—</li>}
        </ul>
      )}
      {tab === 'recipes' && onPickRecipe && (
        <ul className="list">
          {recipes.filter((x) => !x.deleted).map((r) => (
            <li key={r.id} className="clickable" onClick={() => onPickRecipe(r)} data-testid="pick-recipe">
              <div className="grow"><div className="bold">{r.name}</div><MacroLine m={r.perServing} compact /></div>
              <span className="small num">{n(r.perServing.kcal)} {t('kcalUnit')}/{t('unit_serving')}</span>
            </li>
          ))}
          {!recipes.length && <li className="empty">—</li>}
        </ul>
      )}
      {(tab === 'search' || tab === 'recent' || tab === 'frequent' || tab === 'favorites') && (
        <ul className="list" data-testid="food-results">
          {list.map((f) => (
            <li key={f.id} className="clickable food-row" onClick={() => onPickFood(f)} data-testid="food-option">
              <FoodThumb food={f} size={48} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="fr-name bold clamp2">{displayName(f, lang)}</span>
                  <StateChip state={f.state} label={f.stateLabel} />
                </div>
                {f.incomplete ? <div className="tiny muted">{t('incompleteFood')}</div> : <>
                  <MacroSplit m={f.per100} />
                  <div className="tiny muted num"><MacroLine m={f.per100} compact /> · <SourceTag source={f.source} /></div>
                </>}
              </div>
              <div className="fr-kcal num">{f.incomplete ? '—' : n(f.per100.kcal)}<small>{t('kcalUnit')} / 100{t('g')}</small></div>
              <button className="icon-btn fr-fav" style={{ color: f.favorite ? 'var(--carbs)' : 'var(--faint)' }} onClick={(e) => { e.stopPropagation(); toggleFavoriteFood(f.id); }} aria-label={t('favorites')}>
                <Icon name="star" filled={f.favorite} />
              </button>
            </li>
          ))}
          {!list.length && !refResults.length && refState !== 'loading' && <li className="empty">{t('noResults')}</li>}
        </ul>
      )}
      {searching && (
        <div className="stack" data-testid="ref-section">
          <div className="row between">
            <span className="section-label" style={{ margin: 0 }}>{t('refDb')} <span className="src-tag usda">{t('usdaBadge')}</span></span>
            {refState === 'ready' && <span className="tiny muted num">{refResults.length}</span>}
          </div>
          {refState === 'loading' && <div className="tiny muted">{t('refDbLoading')}</div>}
          {refState === 'error' && <div className="tiny muted">{t('refDbOffline')}</div>}
          <ul className="list" data-testid="ref-results">
            {refResults.map((rf) => (
              <li key={rf.id} className="clickable food-row" onClick={() => pickRef(rf)} data-testid="ref-option">
                <FoodThumb food={{ nameEn: rf.name, sourceRef: rf.source }} category={rf.category} size={48} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="fr-name bold" dir="ltr" style={{ overflowWrap: 'anywhere' }}>{rf.name}</span>
                    {rf.state !== 'other' && <StateChip state={rf.state} />}
                  </div>
                  <MacroSplit m={rf.per100} />
                  <div className="tiny muted num"><MacroLine m={rf.per100} compact /> · {rf.category}</div>
                </div>
                <div className="fr-kcal num">{n(rf.per100.kcal)}<small>{t('kcalUnit')} / 100{t('g')}</small></div>
              </li>
            ))}
          </ul>
          <div className="notice" data-testid="create-hint">
            <div className="tiny muted">{t('createFoodHint')}</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              <button className="btn sm primary" onClick={() => setCreating(true)} data-testid="create-from-search">+ {t('createFoodNamed', { q: q.trim() })}</button>
              <button className="btn sm" disabled={off.state === 'loading'} data-testid="off-search" onClick={async () => {
                setOff({ state: 'loading', items: [] });
                try { setOff({ state: 'done', items: await searchOFF(q.trim()) }); } catch { setOff({ state: 'error', items: [] }); }
              }}><Icon name="globe" /> {t('offSearch')}</button>
            </div>
          </div>
          {off.state === 'error' && <div className="tiny muted">{t('offError')}</div>}
          {off.state === 'done' && (
            <ul className="list" data-testid="off-results">
              {off.items.map((p, i) => (
                <li key={p.barcode + i} className="clickable" onClick={() => setOffPick(p)} data-testid="off-option">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="bold" style={{ overflowWrap: 'anywhere' }}>{p.name}{p.brand ? ` · ${p.brand}` : ''}</div>
                    <div className="tiny muted">{n(p.per100.kcal)} {t('kcalUnit')} · {t('per100')} · <MacroLine m={p.per100} compact /> · Open Food Facts</div>
                  </div>
                  <span className="chip">+</span>
                </li>
              ))}
              {!off.items.length && <li className="empty">{t('offNone')}</li>}
            </ul>
          )}
        </div>
      )}
      {creating && <FoodEditor food={null} initialName={q.trim()} onClose={() => setCreating(false)} onSaved={(f) => onPickFood(f)} />}
      {offPick && (
        <Sheet title={t('offResults')} onClose={() => setOffPick(null)}>
          <ProductForm product={offPick} note="" onSaved={(f) => { setOffPick(null); onPickFood(f); }} />
        </Sheet>
      )}
    </div>
  );
}

export function QuantityForm({ food, initial, submitLabel, onSubmit, onBack }: {
  food: Food;
  initial?: { quantity: number; unit: Unit; servingId?: string };
  submitLabel: string;
  onSubmit: (quantity: number, unit: Unit, servingId?: string) => void | Promise<void>;
  onBack?: () => void;
}) {
  const { t, lang, n } = useApp();
  const basis = basisFromFood(food);
  const units = availableUnits(basis);
  const defaultUnit: Unit = initial?.unit ?? 'g';
  const [qty, setQty] = useState<number | ''>(initial?.quantity ?? (defaultUnit === 'g' ? 100 : 1));
  const [unit, setUnit] = useState<Unit>(defaultUnit);
  const [servingId, setServingId] = useState<string | undefined>(initial?.servingId ?? food.servings[0]?.id);
  let preview: ReturnType<typeof macrosFor> | null = null;
  let err = '';
  try {
    if (food.incomplete) err = t('incompleteFood');
    else if (qty !== '') preview = macrosFor(basis, qty, unit, servingId);
  } catch (e) {
    err = e instanceof UnitError && e.code === 'needsPieceWeight' ? t('needsPieceWeight') : (e as Error).message;
  }
  const quick = unit === 'g' || unit === 'ml' ? [50, 100, 150, 200, 250] : [0.5, 1, 2, 3, 4];
  return (
    <div className="stack" data-testid="quantity-form">
      <div className="food-hero">
        <FoodThumb food={food} size={68} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="fh-name">{displayName(food, lang)}</div>
          <div className="row wrap small muted" style={{ gap: 6, marginTop: 2 }}>
            <StateChip state={food.state} label={food.stateLabel} />
            <SourceTag source={food.source} />
            {food.prep && food.prep !== '—' && <span className="tiny">{food.prep}</span>}
          </div>
          <MacroSplit m={food.per100} />
          <div className="tiny muted num">{t('per100')}: {n(food.per100.kcal)} {t('kcalUnit')} · <MacroLine m={food.per100} compact />{food.pieceGrams ? ` · ${t('unit_piece')} = ${n(food.pieceGrams)}${t('g')}` : ''}</div>
        </div>
        {onBack && <button className="icon-btn flip" onClick={onBack} aria-label={t('previous')}><Icon name="back" /></button>}
      </div>
      {food.state !== 'other' && <div className="banner info tiny" style={{ margin: 0 }}>{t('rawCookedWarning')} ({t('state_' + food.state)})</div>}
      <div className="grid2">
        <label className="field">
          <span>{t('quantity')}</span>
          <input className="input num" type="number" inputMode="decimal" step="any" min="0" value={qty} data-testid="qty-input"
            onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))} />
        </label>
        <label className="field">
          <span>{t('unit')}</span>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} data-testid="unit-select">
            <UnitOptions basis={basis} units={units} />
          </select>
        </label>
      </div>
      {unit === 'serving' && food.servings.length > 0 && (
        <select className="input" value={servingId} onChange={(e) => setServingId(e.target.value)}>
          {food.servings.map((s) => <option key={s.id} value={s.id}>{s.name} ({n(s.grams)} {t('g')})</option>)}
        </select>
      )}
      {(unit === 'ml' || unit === 'tbsp' || unit === 'tsp') && !food.gramsPerMl && <div className="tiny muted">{t('densityAssumed')}</div>}
      <div className="row wrap" style={{ gap: 6 }}>
        {quick.map((v) => <button key={v} className={`chip ${qty === v ? 'active' : ''}`} onClick={() => setQty(v)}>{n(v, 1)}</button>)}
      </div>
      {preview && (
        <div className="qty-preview" data-testid="qty-preview">
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <span className="qp-kcal num" data-testid="preview-kcal">{n(preview.macros.kcal)} <span className="small muted">{t('kcalUnit')}</span></span>
            {preview.grams > 0 && <span className="small muted num">{n(preview.grams, 1)} {t('g')}</span>}
          </div>
          <div className="qp-macros">
            {(['protein', 'carbs', 'fat'] as const).map((k) => (
              <div key={k} className="qp-m" style={{ ['--c' as string]: `var(--${k})` }}><b className="num">{n(preview!.macros[k], 1)}</b><span>{t(k)} · {t('g')}</span></div>
            ))}
          </div>
          <OptionalNutrientsLine m={preview.macros} />
        </div>
      )}
      {err && <div className="banner error small" style={{ margin: 0 }}>{err}</div>}
      <button className="btn primary block" disabled={!preview} onClick={() => qty !== '' && onSubmit(qty, unit, unit === 'serving' ? servingId : undefined)} data-testid="qty-submit">
        {submitLabel}
      </button>
    </div>
  );
}

function uniqueHistory(list: DiaryEntry[], q: string): DiaryEntry[] {
  const seen = new Set<string>();
  const nq = q.trim().toLowerCase();
  const out: DiaryEntry[] = [];
  for (const e of list) {
    const k = `${e.foodId ?? e.recipeId}|${e.quantity}|${e.unit}`;
    if (seen.has(k)) continue;
    if (nq && !e.name.toLowerCase().includes(nq)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** Energy split of a food (protein / carbs / fat share of calories) — a compact "fingerprint" bar. */
export function MacroSplit({ m }: { m: { protein: number; carbs: number; fat: number } }) {
  const p = m.protein * 4, c = m.carbs * 4, f = m.fat * 9, sum = p + c + f;
  if (!(sum > 0)) return null;
  return (
    <span className="macro-split" aria-hidden="true">
      <i style={{ flexGrow: p / sum, background: 'var(--protein)' }} />
      <i style={{ flexGrow: c / sum, background: 'var(--carbs)' }} />
      <i style={{ flexGrow: f / sum, background: 'var(--fat)' }} />
    </span>
  );
}

/** Where a food's values come from. */
export function SourceTag({ source }: { source: Food['source'] }) {
  const { t } = useApp();
  const label = source === 'usda' ? t('usdaBadge') : source === 'openfoodfacts' ? 'Open Food Facts' : source === 'sheet' ? 'Hub' : t('srcMine');
  return <span className={`src-tag ${source}`}>{label}</span>;
}
