import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CookTab, LibraryTab, SuggestTab } from './RecipeLibrary';
import { useApp } from '../app/AppContext';
import { FoodPicker, QuantityForm } from '../components/FoodPicker';
import { Icon } from '../components/icons';
import { Card, Confirm, MacroLine, NumField, Segmented, Sheet, StateChip, TextField, useAsync } from '../components/ui';
import { db } from '../lib/db';
import { isValidISODate, today } from '../lib/dates';
import {
  addRecipeEntry, buildIngredient, computeRecipe, deleteEntries, deleteRecipe, deleteTemplate, duplicateRecipe, logItems, saveRecipe, saveTemplate, totalsForItems, uid, displayName
} from '../lib/repo';
import { MEALS, type Food, type MealTemplate, type MealType, type PlanItem, type Recipe, type RecipeIngredient } from '../lib/types';

type RTab = 'library' | 'suggest' | 'cook' | 'recipes' | 'meals';

export default function Recipes() {
  const { t } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = (['library', 'suggest', 'cook', 'recipes', 'meals'].includes(params.get('tab') ?? '') ? params.get('tab') : 'library') as RTab;
  const setTab = (x: RTab) => setParams({ tab: x }, { replace: true });
  return (
    <div data-testid="recipes-page">
      <div style={{ marginBottom: 12 }}>
        <Segmented value={tab} options={[{ value: 'library', label: t('library') }, { value: 'suggest', label: t('suggestions') }, { value: 'cook', label: t('cookTab') }, { value: 'recipes', label: t('myRecipes') }, { value: 'meals', label: t('savedMeals') }]} onChange={setTab} />
      </div>
      {tab === 'library' && <LibraryTab />}
      {tab === 'suggest' && <SuggestTab />}
      {tab === 'cook' && <CookTab />}
      {tab === 'recipes' && <RecipeList />}
      {tab === 'meals' && <TemplateList />}
    </div>
  );
}

function RecipeList() {
  const { t, n, toast } = useApp();
  const recipes = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().toArray(), [], []);
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null);
  const [logging, setLogging] = useState<Recipe | null>(null);
  return (
    <>
      <button className="btn primary block" onClick={() => setEditing('new')} data-testid="new-recipe" style={{ marginBottom: 12 }}>+ {t('newRecipe')}</button>
      {recipes.map((r) => (
        <Card key={r.id} title={r.name} actions={<>
          <button className="btn sm" onClick={() => setEditing(r)}>{t('edit')}</button>
          <button className="btn sm" onClick={async () => { await duplicateRecipe(r.id); toast(t('duplicated')); }} data-testid="recipe-duplicate">{t('duplicateRecipe')}</button>
          <button className="btn sm primary" onClick={() => setLogging(r)} data-testid="recipe-add-diary">{t('addToDiary')}</button>
        </>}>
          <div className="small"><b className="num">{n(r.perServing.kcal)}</b> {t('kcalUnit')} / {t('unit_serving')} · <MacroLine m={r.perServing} /></div>
          {r.libraryId && <div className="tiny muted">📚 {t('library')}</div>}
          <div className="tiny muted">{r.ingredients.length} {t('ingredients')} · {t('servings')}: {n(r.servings, 1)} · {t('total')}: {n(r.totals.kcal)} {t('kcalUnit')}</div>
        </Card>
      ))}
      {!recipes.length && <div className="empty">—</div>}
      {editing && <RecipeEditor recipe={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {logging && <LogRecipeSheet recipe={logging} onClose={() => setLogging(null)} />}
    </>
  );
}

function LogRecipeSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const { t, toast } = useApp();
  const [date, setDate] = useState(today());
  const [meal, setMeal] = useState<MealType>('lunch');
  const [servings, setServings] = useState<number | ''>(1);
  return (
    <Sheet title={`${t('addToDiary')} — ${recipe.name}`} onClose={onClose} footer={
      <button className="btn primary block" disabled={!(Number(servings) > 0) || !isValidISODate(date)} data-testid="recipe-log-confirm"
        onClick={async () => { await addRecipeEntry(date, meal, recipe, Number(servings)); toast(t('added')); onClose(); }}>{t('logFood')}</button>}>
      <div className="stack">
        <label className="field"><span>{t('date')}</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <Segmented value={meal} options={MEALS.map((m) => ({ value: m, label: t(m) }))} onChange={setMeal} />
        <NumField label={t('logServings')} value={servings} onChange={setServings} testId="recipe-log-servings" />
      </div>
    </Sheet>
  );
}

function RecipeEditor({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const { t, n } = useApp();
  const [name, setName] = useState(recipe?.name ?? '');
  const [servings, setServings] = useState<number | ''>(recipe?.servings ?? 1);
  const [ings, setIngs] = useState<RecipeIngredient[]>(recipe?.ingredients ?? []);
  const [notes, setNotes] = useState(recipe?.notes ?? '');
  const [picking, setPicking] = useState(false);
  const [food, setFood] = useState<Food | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { run } = useAsync();
  const calc = ings.length && Number(servings) > 0 ? computeRecipe(ings, Number(servings)) : null;

  return (
    <Sheet title={recipe ? recipe.name : t('newRecipe')} onClose={onClose}>
      <div className="stack" data-testid="recipe-editor">
        <TextField label={t('recipeName')} value={name} onChange={setName} testId="recipe-name" />
        <NumField label={t('servings')} value={servings} onChange={setServings} testId="recipe-servings-input" />
        <div className="card-head"><h3>{t('ingredients')}</h3><button className="btn sm" onClick={() => setPicking(true)} data-testid="add-ingredient">+ {t('addIngredient')}</button></div>
        <ul className="list" data-testid="ingredients">
          {ings.map((i, idx) => (
            <li key={idx}>
              <div className="grow"><div className="row" style={{ gap: 6 }}><span className="bold small">{i.name}</span><StateChip state={i.state} /></div>
                <div className="tiny muted num">{n(i.quantity, 2)} {t('unit_' + i.unit)} ({n(i.grams)} {t('g')}) · {n(i.macros.kcal)} {t('kcalUnit')}</div></div>
              <button className="icon-btn" onClick={() => setIngs(ings.filter((_, j) => j !== idx))} aria-label={t('delete')}><Icon name="trash" /></button>
            </li>
          ))}
        </ul>
        {calc && (
          <div className="grid2" data-testid="recipe-totals">
            <div className="stat"><div className="k">{t('total')}</div><div className="v num" data-testid="recipe-total-kcal">{n(calc.totals.kcal)}</div><MacroLine m={calc.totals} compact /><div className="tiny muted">{t('totalWeight')}: {n(calc.totalGrams)} {t('g')}</div></div>
            <div className="stat"><div className="k">{t('perServing')}</div><div className="v num" data-testid="recipe-serving-kcal">{n(calc.perServing.kcal)}</div><MacroLine m={calc.perServing} compact /></div>
          </div>
        )}
        <label className="field"><span>{t('notes')}</span><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <button className="btn primary block" disabled={!name.trim() || !ings.length || !(Number(servings) > 0)} data-testid="recipe-save"
          onClick={async () => { if (await run(() => saveRecipe({ id: recipe?.id, name, servings: Number(servings), ingredients: ings, notes }), t('saved'))) onClose(); }}>{t('save')}</button>
        {recipe && <button className="btn danger block" onClick={() => setConfirm(true)}>{t('delete')}</button>}
      </div>
      {picking && (
        <Sheet title={t('addIngredient')} onClose={() => { setPicking(false); setFood(null); }}>
          {!food ? <FoodPicker onPickFood={setFood} /> : (
            <QuantityForm food={food} submitLabel={t('add')} onBack={() => setFood(null)} onSubmit={async (q, u, s) => {
              const ing = await run(() => buildIngredient(food.id, q, u, s));
              if (ing) { setIngs((x) => [...x, ing]); setFood(null); setPicking(false); }
            }} />
          )}
        </Sheet>
      )}
      {confirm && recipe && <Confirm danger message={`${t('delete')}: ${recipe.name}?`} onNo={() => setConfirm(false)} onYes={async () => { await deleteRecipe(recipe.id); onClose(); }} />}
    </Sheet>
  );
}

function TemplateList() {
  const { t, n, toast } = useApp();
  const templates = useLiveQuery(() => db.templates.orderBy('updatedAt').reverse().toArray(), [], []);
  const [editing, setEditing] = useState<MealTemplate | 'new' | null>(null);
  const [totals, setTotals] = useState<Record<string, number>>({});
  useEffect(() => {
    Promise.all(templates.map(async (tp) => [tp.id, (await totalsForItems(tp.items)).total.kcal] as const)).then((x) => setTotals(Object.fromEntries(x)));
  }, [templates]);
  return (
    <>
      <button className="btn primary block" onClick={() => setEditing('new')} style={{ marginBottom: 12 }} data-testid="new-template">+ {t('newSavedMeal')}</button>
      {templates.map((tp) => (
        <Card key={tp.id} title={tp.name} actions={<>
          <button className="btn sm" onClick={() => setEditing(tp)}>{t('edit')}</button>
          <button className="btn sm primary" onClick={async () => { const r = await logItems(today(), tp.items); toast(t('logged', { n: r.logged.length }), { label: t('undo'), run: () => deleteEntries(r.logged.map((x) => x.id)) }); }}>{t('logMeal')} ({t('today')})</button>
        </>}>
          <div className="tiny muted">{tp.items.map((i) => i.name).join(' · ')}</div>
          <div className="small num">{n(totals[tp.id])} {t('kcalUnit')}</div>
        </Card>
      ))}
      {!templates.length && <div className="empty">—</div>}
      {editing && <ItemsEditor title={editing === 'new' ? t('newSavedMeal') : editing.name} initialName={editing === 'new' ? '' : editing.name}
        initialItems={editing === 'new' ? [] : editing.items} onClose={() => setEditing(null)}
        onDelete={editing === 'new' ? undefined : async () => { await deleteTemplate(editing.id); setEditing(null); }}
        onSave={async (name, items) => { await saveTemplate({ id: editing === 'new' ? undefined : editing.id, name, items, favorite: true }); setEditing(null); }} />}
    </>
  );
}

/** Editor for a list of plan items (used by saved meals and day plans). */
export function ItemsEditor({ title, initialName, initialItems, onSave, onClose, onDelete, extra }: {
  title: string; initialName: string; initialItems: PlanItem[]; onSave: (name: string, items: PlanItem[]) => Promise<void>; onClose: () => void; onDelete?: () => Promise<void>;
  extra?: React.ReactNode;
}) {
  const { t, n, lang } = useApp();
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<PlanItem[]>(initialItems);
  const [adding, setAdding] = useState<MealType | null>(null);
  const [food, setFood] = useState<Food | null>(null);
  const [kcal, setKcal] = useState<Record<string, number>>({});
  useEffect(() => {
    totalsForItems(items).then((r) => setKcal(Object.fromEntries(r.resolved.map((x) => [x.item.id, x.macros.kcal]))));
  }, [items]);
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="stack" data-testid="items-editor">
        <TextField label={t('name')} value={name} onChange={setName} testId="items-name" />
        {extra}
        {MEALS.map((m) => (
          <div key={m}>
            <div className="card-head"><h3 className="small">{t(m)}</h3><button className="btn sm" onClick={() => setAdding(m)} data-testid={`items-add-${m}`}>+ {t('add')}</button></div>
            {items.filter((i) => i.meal === m).map((i) => (
              <div key={i.id} className="row small" style={{ padding: '4px 0' }}>
                <span className="grow">{i.name} <span className="muted num">· {n(i.quantity, 2)} {t('unit_' + i.unit)}</span></span>
                <span className="num">{n(kcal[i.id])}</span>
                <input className="input num" style={{ width: 80, minHeight: 34 }} type="number" step="any" value={i.quantity} aria-label={t('quantity')}
                  onChange={(e) => setItems(items.map((x) => (x.id === i.id ? { ...x, quantity: Number(e.target.value) || 0 } : x)))} />
                <button className="icon-btn" onClick={() => setItems(items.filter((x) => x.id !== i.id))} aria-label={t('delete')}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        ))}
        <button className="btn primary block" disabled={!name.trim()} onClick={() => onSave(name.trim(), items.filter((i) => i.quantity > 0))} data-testid="items-save">{t('save')}</button>
        {onDelete && <button className="btn danger block" onClick={onDelete}>{t('delete')}</button>}
      </div>
      {adding && (
        <Sheet title={`${t('add')} — ${t(adding)}`} onClose={() => { setAdding(null); setFood(null); }}>
          {!food ? (
            <FoodPicker onPickFood={setFood} onPickRecipe={(r) => { setItems((x) => [...x, { id: uid(), meal: adding, recipeId: r.id, name: r.name, quantity: 1, unit: 'serving' }]); setAdding(null); }} />
          ) : (
            <QuantityForm food={food} submitLabel={t('add')} onBack={() => setFood(null)} onSubmit={(q, u, s) => {
              setItems((x) => [...x, { id: uid(), meal: adding, foodId: food.id, name: displayName(food, lang), quantity: q, unit: u, servingId: s }]);
              setFood(null);
              setAdding(null);
            }} />
          )}
        </Sheet>
      )}
    </Sheet>
  );
}
