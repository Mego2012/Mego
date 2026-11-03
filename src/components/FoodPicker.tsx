import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { db } from '../lib/db';
import { availableUnits, basisFromFood, macrosFor, UnitError } from '../lib/nutrition';
import { displayName, toggleFavoriteFood } from '../lib/repo';
import { filterFoods } from '../lib/search';
import type { Food, MealTemplate, Recipe, Unit } from '../lib/types';
import { Icon } from './icons';
import { MacroLine, Segmented, StateChip } from './ui';

type Tab = 'search' | 'recent' | 'favorites' | 'meals' | 'recipes';

export function FoodPicker({ onPickFood, onPickRecipe, onPickTemplate }: {
  onPickFood: (f: Food) => void;
  onPickRecipe?: (r: Recipe) => void;
  onPickTemplate?: (t: MealTemplate) => void;
}) {
  const { t, lang, n } = useApp();
  const [tab, setTab] = useState<Tab>('search');
  const [q, setQ] = useState('');
  const [state, setState] = useState<'' | Food['state']>('');
  const foods = useLiveQuery(() => db.foods.toArray(), [], []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], []);
  const templates = useLiveQuery(() => db.templates.toArray(), [], []);

  const list = useMemo(() => {
    if (tab === 'recent') return foods.filter((f) => f.lastUsedAt && !f.archived).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).slice(0, 30);
    if (tab === 'favorites') return filterFoods(foods, { favoritesOnly: true, q, state });
    return filterFoods(foods, { q, state }).slice(0, 80);
  }, [foods, tab, q, state]);

  const tabs: { value: Tab; label: string }[] = [
    { value: 'search', label: t('all') },
    { value: 'recent', label: t('recent') },
    { value: 'favorites', label: t('favorites') }
  ];
  if (onPickTemplate) tabs.push({ value: 'meals', label: t('savedMeals') });
  if (onPickRecipe) tabs.push({ value: 'recipes', label: t('recipes') });

  return (
    <div className="stack">
      <div className="row">
        <div className="grow" style={{ position: 'relative' }}>
          <input className="input" autoFocus placeholder={t('search') + '…'} value={q} onChange={(e) => { setQ(e.target.value); if (tab !== 'search' && tab !== 'favorites') setTab('search'); }} data-testid="food-search" />
        </div>
        <select className="input" style={{ width: 'auto' }} value={state} onChange={(e) => setState(e.target.value as Food['state'] | '')} aria-label={t('state')} data-testid="state-filter">
          <option value="">{t('all')}</option>
          <option value="raw">{t('state_raw')}</option>
          <option value="cooked">{t('state_cooked')}</option>
          <option value="other">{t('state_other')}</option>
        </select>
      </div>
      <Segmented value={tab} options={tabs} onChange={setTab} />
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
      {(tab === 'search' || tab === 'recent' || tab === 'favorites') && (
        <ul className="list" data-testid="food-results">
          {list.map((f) => (
            <li key={f.id} className="clickable" onClick={() => onPickFood(f)} data-testid="food-option">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="bold ellipsis">{displayName(f, lang)}</span>
                  <StateChip state={f.state} label={f.stateLabel} />
                </div>
                <div className="tiny muted">{f.incomplete ? t('incompleteFood') : <>{n(f.per100.kcal)} {t('kcalUnit')} · {t('per100')} · <MacroLine m={f.per100} compact /></>}</div>
              </div>
              <button className="icon-btn" style={{ color: f.favorite ? 'var(--warn)' : 'var(--muted)' }} onClick={(e) => { e.stopPropagation(); toggleFavoriteFood(f.id); }} aria-label={t('favorites')}>
                <Icon name="star" filled={f.favorite} />
              </button>
            </li>
          ))}
          {!list.length && <li className="empty">{t('noResults')}</li>}
        </ul>
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
  const quick = unit === 'g' ? [50, 100, 150, 200, 250] : [0.5, 1, 2, 3, 4];
  return (
    <div className="stack" data-testid="quantity-form">
      <div className="row between">
        <div className="grow">
          <div className="bold" style={{ fontSize: 17 }}>{displayName(food, lang)}</div>
          <div className="row wrap small muted" style={{ gap: 6 }}>
            <StateChip state={food.state} label={food.stateLabel} />
            {food.stateLabel && <span>{food.stateLabel}</span>}
            {food.prep && food.prep !== '—' && <span>· {food.prep}</span>}
          </div>
        </div>
        {onBack && <button className="btn sm" onClick={onBack}>{t('previous')}</button>}
      </div>
      <div className="tiny muted">{t('per100')}: {n(food.per100.kcal)} {t('kcalUnit')} · <MacroLine m={food.per100} compact />{food.pieceGrams ? ` · ${t('unit_piece')} = ${n(food.pieceGrams)}${t('g')}` : ''}</div>
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
            {units.map((u) => <option key={u} value={u}>{t('unit_' + u)}</option>)}
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
        <div className="stat" data-testid="qty-preview">
          <div className="row between">
            <span className="big num" data-testid="preview-kcal">{n(preview.macros.kcal)} <span className="small muted">{t('kcalUnit')}</span></span>
            {preview.grams > 0 && <span className="small muted num">{n(preview.grams, 1)} {t('g')}</span>}
          </div>
          <MacroLine m={preview.macros} />
        </div>
      )}
      {err && <div className="banner error small" style={{ margin: 0 }}>{err}</div>}
      <button className="btn primary block" disabled={!preview} onClick={() => qty !== '' && onSubmit(qty, unit, unit === 'serving' ? servingId : undefined)} data-testid="qty-submit">
        {submitLabel}
      </button>
    </div>
  );
}
