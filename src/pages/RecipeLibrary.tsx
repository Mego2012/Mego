import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useBundle } from '../app/hooks';
import { Icon } from '../components/icons';
import { PhotoPlaceholder, RecipeMosaic } from '../components/FoodThumb';
import { Card, MacroLine, NumField, Segmented, Sheet, StateChip, useAsync } from '../components/ui';
import { db } from '../lib/db';
import { isValidISODate, today } from '../lib/dates';
import { round, roundMacros, scaleMacros } from '../lib/nutrition';
import { allLibraryIngredients, approveRecipeMatches, computeLibrary, materializeLibraryRecipe, recipeMeta, suggest, whatCanICook, type ComputedRecipe, type SuggestFilters, type Suggestion } from '../lib/recipeEngine';
import { kvGet } from '../lib/repo';
import { addRecipeEntry, deleteEntry, kvSet, setPlannedDay, uid } from '../lib/repo';
import { summarizeDay } from '../lib/reports';
import { normalizeText } from '../lib/search';
import { FoodEditor } from './Foods';
import { MEALS, type MealType } from '../lib/types';

export function useLibrary() {
  const foods = useLiveQuery(() => db.foods.toArray(), [], null);
  const [lib, setLib] = useState<ComputedRecipe[] | null>(null);
  useEffect(() => { if (foods) computeLibrary().then(setLib); }, [foods]);
  const meta = useLiveQuery(() => recipeMeta(), [], { favorites: new Set<string>(), ratings: {} as Record<string, number> });
  return { lib, meta, foods };
}

const TAGS = ['all', 'favorites', 'high_protein', 'low_calorie', 'low_carb', 'chicken', 'eggs', 'rice', 'fish', 'meat', 'sandwich', 'quick', 'meal_prep', 'high_fiber', 'vegetarian', 'breakfast_idea'] as const;

function hasTag(c: ComputedRecipe, tag: (typeof TAGS)[number], favs: Set<string>): boolean {
  if (tag === 'all') return true;
  if (tag === 'favorites') return favs.has(c.lib.id);
  if (tag === 'quick') return c.totalTime <= 20;
  const derived = tag.replace(/_/g, '-');
  if ((c.derived as string[]).includes(derived)) return true;
  return (c.lib.tags as string[]).includes(derived);
}

export function LibraryTab() {
  const { t, lang, n } = useApp();
  const { lib, meta } = useLibrary();
  const [tag, setTag] = useState<(typeof TAGS)[number]>('all');
  const [meal, setMeal] = useState<MealType | ''>('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<ComputedRecipe | null>(null);
  const list = useMemo(() => {
    if (!lib) return [];
    const nq = normalizeText(q);
    return lib.filter((c) => hasTag(c, tag, meta.favorites) && (!meal || c.lib.meals.includes(meal)) && (!nq || normalizeText(`${c.lib.nameAr} ${c.lib.nameEn} ${c.lib.ingredients.map((i) => i[0]).join(' ')}`).includes(nq)));
  }, [lib, tag, meal, q, meta]);
  if (!lib) return <div className="empty">{t('loading')}</div>;
  return (
    <div data-testid="library">
      <Card>
        <div className="search-field"><Icon name="search" /><input className="input" placeholder={t('search') + '…'} value={q} onChange={(e) => setQ(e.target.value)} data-testid="library-search" /></div>
        <div className="tool-row" style={{ marginTop: 8 }}>
          {TAGS.map((x) => <button key={x} className={`chip clickable ${tag === x ? 'on' : ''}`} onClick={() => setTag(x)} data-testid={`tag-${x}`}>{t('tag_' + x)}</button>)}
        </div>
        <div style={{ marginTop: 8 }}>
          <Segmented<MealType | ''> value={meal} options={[{ value: '', label: t('all') }, ...MEALS.map((m) => ({ value: m, label: t(m) }))]} onChange={setMeal} />
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }} data-testid="library-count">{list.length} / {lib.length} · {t('computedFromDb')}</div>
      </Card>
      {list.map((c) => (
        <div key={c.lib.id} className="card row clickable" style={{ cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => setOpen(c)} data-testid="library-card">
          <RecipeMosaic ingredients={c.lib.ingredients} size={76} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="bold">{lang === 'ar' ? c.lib.nameAr : c.lib.nameEn}</div>
            <div className="tiny muted">{lang === 'ar' ? c.lib.nameEn : c.lib.nameAr}</div>
            <div className="small num" style={{ marginTop: 4 }} data-testid="card-kcal"><b>{n(c.perServing.kcal)}</b> {t('kcalUnit')} · <MacroLine m={c.perServing} compact /> <span className="tiny muted">· {t('perServingG', { g: n(c.gramsPerServing) })}</span></div>
            {!c.ok && <div className="tiny delta pos">{t('partialNutrition', { list: c.missing.join('، ') })}</div>}
            <div className="row wrap tiny muted" style={{ gap: 6, marginTop: 4 }}>
              <span className="row" style={{ gap: 3 }}><Icon name="history" /> {c.totalTime} {t('min')}</span>
              {c.derived.map((d) => <span key={d} className="chip good">{t('tag_' + d.replace(/-/g, '_'))}</span>)}
              {c.isEstimate && <span className="chip warn">{t('estimatedBadge')}</span>}
              {c.usda.length > 0 && <span className="chip" data-testid="usda-chip">{t('usdaMatchedN', { n: c.usda.length })}</span>}
              {meta.favorites.has(c.lib.id) && <span className="fav-star"><Icon name="star" filled /></span>}
              {meta.ratings[c.lib.id] ? <span>{'★'.repeat(meta.ratings[c.lib.id])}</span> : null}
            </div>
          </div>
        </div>
      ))}
      {!list.length && <div className="empty">{t('empty_library')}</div>}
      {open && <RecipeDetail c={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function RecipeDetail({ c, onClose, servingsHint = 1 }: { c: ComputedRecipe; onClose: () => void; servingsHint?: number }) {
  const { t, lang, n, toast } = useApp();
  const { meta } = useLibrary();
  const [action, setAction] = useState<'diary' | 'plan' | null>(null);
  const [addFood, setAddFood] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const { run } = useAsync();
  const fav = meta.favorites.has(c.lib.id);
  const rating = meta.ratings[c.lib.id] ?? 0;
  const L = c.lib;
  const steps = lang === 'ar' ? L.stepsAr : L.stepsEn;
  const tips = lang === 'ar' ? L.tipsAr : L.tipsEn;
  return (
    <Sheet title={lang === 'ar' ? L.nameAr : L.nameEn} onClose={onClose}>
      <div className="stack" data-testid="recipe-detail">
        <div className="recipe-cover"><RecipeMosaic ingredients={L.ingredients} size={132} /></div>
        <div className="tiny muted">{lang === 'ar' ? L.nameEn : L.nameAr}</div>
        <div className="row wrap small" style={{ gap: 6 }}>
          <span className="chip">{t('prep')} {L.prepMin} {t('min')}</span>
          <span className="chip">{t('cook')} {L.cookMin} {t('min')}</span>
          <span className="chip">{t('difficulty')}: {t('diff_' + L.difficulty)}</span>
          <span className="chip">{t('servingsN', { n: L.servings })}</span>
          {L.methods.map((m) => <span key={m} className="chip">{t('method_' + m.replace('-', '_'))}</span>)}
        </div>
        <div className="grid2" data-testid="detail-nutrition">
          <div className="stat"><div className="k">{t('perServing')} · {t('perServingG', { g: n(c.gramsPerServing) })}</div><div className="v num" data-testid="detail-kcal">{n(c.perServing.kcal)} {t('kcalUnit')}</div><MacroLine m={c.perServing} />
            <div className="tiny muted">{t('fiber')}: {c.perServing.fiber !== undefined ? `${n(c.perServing.fiber, 1)} ${t('g')}` : t('unknown')}</div></div>
          <div className="stat"><div className="k">{t('total')} · {t('servingsN', { n: L.servings })}</div><div className="v num" data-testid="detail-total">{n(c.totals.kcal)} {t('kcalUnit')}</div><MacroLine m={c.totals} compact />
            <div className="tiny muted">{t('fiber')}: {c.totals.fiber !== undefined ? `${n(c.totals.fiber, 1)} ${t('g')}` : t('unknown')}</div></div>
        </div>
        {!c.ok && <div className="banner error small" data-testid="detail-missing">{t('partialNutrition', { list: c.missing.join('، ') })}</div>}
        {c.usda.length > 0 && !approved && (
          <div className="banner info small" data-testid="usda-approve">
            <div>{t('usdaMatchesNote', { list: c.usda.join('، ') })}</div>
            <button className="btn sm primary" style={{ marginTop: 6 }} data-testid="approve-matches"
              onClick={async () => { const k = await run(() => approveRecipeMatches(c.usda)); if (k !== undefined) { setApproved(true); toast(t('usdaApproved', { n: k })); } }}>{t('approveMatches')}</button>
          </div>
        )}
        <div className="tiny muted">{t('recipeWeightsNote')}</div>
        <div className="tiny muted">{t('computedFromDb')}</div>
        {c.estimatedFoods.length > 0 && <div className="banner info tiny">{t('estimatedNote', { list: c.estimatedFoods.join('، ') })}</div>}
        {L.uncounted.length > 0 && <div className="tiny muted">{t('uncounted', { list: L.uncounted.map((u) => (lang === 'ar' ? u[0] : u[1])).join('، '), kcal: c.uncountedKcal })}</div>}
        <div className="row" style={{ gap: 6 }}>
          <span className="small">{t('rate_')}:</span>
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} className="icon-btn" style={{ width: 32, height: 32, color: s <= rating ? 'var(--warn)' : 'var(--muted)' }} aria-label={`${s}`} data-testid={`rate-${s}`}
              onClick={() => kvSet('recipeRatings', { ...meta.ratings, [L.id]: s === rating ? 0 : s })}><Icon name="star" filled={s <= rating} /></button>
          ))}
          <button className={`chip ${fav ? 'active' : ''}`} data-testid="recipe-fav"
            onClick={() => { const f = new Set(meta.favorites); if (fav) f.delete(L.id); else f.add(L.id); kvSet('recipeFavorites', [...f]); }}><Icon name="star" filled={fav} /> {t('favorite')}</button>
        </div>
        <h3 className="small bold" style={{ margin: '6px 0 0' }}>{t('ingredients')}</h3>
        <ul className="list" data-testid="ingredient-list">
          {L.ingredients.map(([name, grams, noteAr, noteEn], i) => {
            const it = c.items[i];
            return (
              <li key={name + i} data-testid="ingredient-row" data-source={it?.source}>
                <div className="grow"><span className="small">{name}</span> {it?.state && it.state !== 'other' && <StateChip state={it.state as 'raw' | 'cooked'} />}
                  <span className={`chip tiny ${it?.source === 'missing' ? 'warn' : it?.source === 'usda' ? '' : 'good'}`}>{t('src_' + (it?.source ?? 'missing'))}</span>
                  {it?.source === 'usda' && <div className="tiny muted" dir="ltr">{it.foodName}</div>}
                  {(noteAr || noteEn) && <div className="tiny muted">{lang === 'ar' ? noteAr : noteEn}</div>}
                  {it?.source === 'missing' && <button className="btn sm" style={{ marginTop: 4 }} onClick={() => setAddFood(name)} data-testid="add-missing">{t('addMissingFood')}</button>}</div>
                <span className="num small" style={{ textAlign: 'end' }}><b>{n(grams)} {t('g')}</b>{it?.macros && <div className="tiny muted">{n(it.macros.kcal)} {t('kcalUnit')}</div>}</span>
              </li>
            );
          })}
        </ul>
        <h3 className="small bold" style={{ margin: '6px 0 0' }}>{t('steps')}</h3>
        <ol className="small" style={{ paddingInlineStart: 20, margin: 0 }}>{steps.map((s, i) => <li key={i} style={{ marginBottom: 6 }}>{s}</li>)}</ol>
        {tips.length > 0 && <><h3 className="small bold" style={{ margin: '6px 0 0' }}>{t('tips')}</h3><ul className="small" style={{ paddingInlineStart: 20, margin: 0 }}>{tips.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
        {c.ok && (
          <div className="row wrap">
            <button className="btn primary grow" onClick={() => setAction('diary')} data-testid="lib-add-diary">{t('addToDiary')}</button>
            <button className="btn grow" onClick={() => setAction('plan')} data-testid="lib-add-plan">{t('addToPlan')}</button>
            <button className="btn block" data-testid="lib-save" onClick={() => run(() => materializeLibraryRecipe(L.id, { approveMatches: true }), t('saved'))}>{t('saveToMyRecipes')}</button>
            {c.usda.length > 0 && !approved && <div className="tiny muted">{t('saveApprovesNote')}</div>}
          </div>
        )}
        {addFood && <FoodEditor food={null} initialName={addFood} onClose={() => setAddFood(null)} onSaved={() => setAddFood(null)} />}
      </div>
      {action && (
        <DateMealServingsSheet title={action === 'diary' ? t('addToDiary') : t('addToPlan')} defaultMeal={L.meals[0]} servings={servingsHint} perServing={c.perServing}
          onClose={() => setAction(null)}
          onConfirm={async (date, meal, servings) => {
            const r = await run(() => materializeLibraryRecipe(L.id, { approveMatches: true }));
            if (!r) return;
            if (action === 'diary') {
              const e = await run(() => addRecipeEntry(date, meal, r, servings));
              if (e) toast(t('added'), { label: t('undo'), run: () => deleteEntry(e.id) });
            } else {
              const cur = await db.plannedDays.get(date);
              await setPlannedDay(date, [...(cur?.items ?? []), { id: uid(), meal, recipeId: r.id, name: r.name, quantity: servings, unit: 'serving' }], cur?.planId);
              toast(t('saved'));
            }
            setAction(null);
          }} />
      )}
    </Sheet>
  );
}

function DateMealServingsSheet({ title, defaultMeal, servings: s0, perServing, onConfirm, onClose }: {
  title: string; defaultMeal: MealType; servings: number; perServing: import('../lib/types').Macros; onConfirm: (date: string, meal: MealType, servings: number) => void; onClose: () => void;
}) {
  const { t, n } = useApp();
  const [date, setDate] = useState(today());
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [servings, setServings] = useState<number | ''>(s0);
  const m = roundMacros(scaleMacros(perServing, Number(servings) || 0));
  return (
    <Sheet title={title} onClose={onClose} footer={<button className="btn primary block" disabled={!(Number(servings) > 0) || !isValidISODate(date)} data-testid="dms-confirm" onClick={() => onConfirm(date, meal, Number(servings))}>{t('confirm')}</button>}>
      <div className="stack">
        <label className="field"><span>{t('date')}</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <Segmented value={meal} options={MEALS.map((x) => ({ value: x, label: t(x) }))} onChange={setMeal} />
        <NumField label={t('logServings')} value={servings} onChange={setServings} step="0.25" testId="dms-servings" />
        <div className="stat small num"><b>{n(m.kcal)} {t('kcalUnit')}</b> · <MacroLine m={m} compact /></div>
      </div>
    </Sheet>
  );
}

const COMMON_INGREDIENTS = ['بيض كامل', 'بياض بيض', 'صدر دجاج', 'أرز أبيض', 'أرز بسمتي نيء/جاف', 'توست بر (خبز أسمر)', 'زبادي يوناني قليل الدسم', 'زبادي يوناني خالي الدسم', 'سمك تونة (معلب بالماء)', 'سمك بلطي/تلابيا', 'بطاطس', 'طماطم', 'خيار', 'خس', 'بصل', 'فلفل رومي (حلو)', 'زيت زيتون', 'تورتيلا قمح', 'خبز عربي أسمر', 'جبن قريش قليل الدسم', 'موز', 'فراولة', 'لحم بقري قليل الدهن 90/10', 'واي بروتين (سكوب)', 'حليب قليل الدسم', 'حمص مطبوخ', 'جبن موزاريلا قليلة الدسم', 'سبانخ', 'بروكلي', 'كوسا', 'جزر', 'معكرونة نيئة/جافة', 'بطاطا حلوة نيئة', 'تفاح', 'تمر', 'لوز'];

export function SuggestTab() {
  const { t, n, lang, settings, toast } = useApp();
  const data = useBundle();
  const { lib, meta } = useLibrary();
  const userRecipes = useLiveQuery(() => db.recipes.toArray(), [], []);
  const [f, setF] = useState<SuggestFilters>({ meal: '' });
  const [haveMode, setHaveMode] = useState(false);
  const [open, setOpen] = useState<Suggestion | null>(null);
  const day = useMemo(() => (data ? summarizeDay(today(), data.entries, data.days.find((d) => d.date === today()), settings) : null), [data, settings]);
  if (!day || !lib) return <div className="empty">{t('loading')}</div>;
  const mealsLeft = Math.max(1, 4 - day.mealsLogged);
  const rem = { ...day.remaining };
  const list = suggest(rem, mealsLeft, lib, userRecipes, { ...f, haveIngredients: haveMode ? f.haveIngredients : undefined }, meta.favorites, meta.ratings);
  const nextMeal: MealType = (f.meal || MEALS.find((m) => day.byMeal[m].kcal === 0) || 'snacks') as MealType;
  return (
    <div data-testid="suggest">
      <Card>
        <div className="small bold" data-testid="suggest-remaining">{t('remainingNow', { kcal: n(Math.max(0, rem.kcal)), p: n(Math.max(0, rem.protein)), c: n(Math.max(0, rem.carbs)), f: n(Math.max(0, rem.fat)) })}</div>
        <div style={{ marginTop: 8 }}>
          <Segmented<MealType | ''> value={f.meal ?? ''} options={[{ value: '', label: t('all') }, ...MEALS.map((m) => ({ value: m, label: t(m) }))]} onChange={(meal) => setF({ ...f, meal })} />
        </div>
        <div className="grid3" style={{ marginTop: 8 }}>
          <NumField label={t('maxKcal')} value={f.maxKcal} onChange={(v) => setF({ ...f, maxKcal: v })} testId="sg-maxKcal" />
          <NumField label={t('minProtein')} value={f.minProtein} onChange={(v) => setF({ ...f, minProtein: v })} testId="sg-minProtein" />
          <NumField label={t('maxCarbs')} value={f.maxCarbs} onChange={(v) => setF({ ...f, maxCarbs: v })} testId="sg-maxCarbs" />
          <NumField label={t('maxFat')} value={f.maxFat} onChange={(v) => setF({ ...f, maxFat: v })} />
          <NumField label={t('maxMinutes')} value={f.maxMinutes} onChange={(v) => setF({ ...f, maxMinutes: v })} />
        </div>
        <label className="check"><input type="checkbox" checked={haveMode} onChange={(e) => setHaveMode(e.target.checked)} />{t('haveIngredients')}</label>
        {haveMode && (
          <div className="row wrap" style={{ gap: 6 }}>
            {COMMON_INGREDIENTS.map((i) => {
              const on = f.haveIngredients?.includes(i);
              return <button key={i} className={`chip ${on ? 'active' : ''}`} onClick={() => setF({ ...f, haveIngredients: on ? f.haveIngredients!.filter((x) => x !== i) : [...(f.haveIngredients ?? []), i] })}>{i}</button>;
            })}
          </div>
        )}
      </Card>
      {rem.kcal < 60 && <div className="banner info">{t('targetReached')}</div>}
      {list.map((s) => (
        <div key={s.kind + s.id} className="card" data-testid="suggestion">
          <div className="row">
            {s.computed ? <RecipeMosaic ingredients={s.computed.lib.ingredients} size={56} /> : <span className="food-thumb" style={{ width: 56, height: 56 }}><PhotoPlaceholder group="other" /></span>}
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="bold">{s.computed ? (lang === 'ar' ? s.computed.lib.nameAr : s.computed.lib.nameEn) : s.name} <span className="small muted">{t('servingsX', { n: n(s.servings, 2) })}</span></div>
              <div className="small num"><b data-testid="suggestion-kcal">{n(s.macros.kcal)}</b> {t('kcalUnit')} · <MacroLine m={s.macros} compact /></div>
              <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>{s.reason.map((r) => <span key={r} className="chip good">{t(r)}</span>)}{s.minutes !== null && <span className="chip">⏱ {s.minutes} {t('min')}</span>}</div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {s.computed && <button className="btn sm" onClick={() => setOpen(s)}>{t('openRecipe')}</button>}
            <button className="btn sm primary grow" data-testid="suggestion-log" onClick={async () => {
              if (!s.recipe && s.computed && s.computed.usda.length > 0) { setOpen(s); return; } // approval first
              const r = s.recipe ?? (await materializeLibraryRecipe(s.id));
              const e = await addRecipeEntry(today(), nextMeal, r, s.servings);
              toast(`${t('added')} → ${t(nextMeal)}`, { label: t('undo'), run: () => deleteEntry(e.id) });
            }}>{t('logFood')} ({t(nextMeal)})</button>
          </div>
        </div>
      ))}
      {rem.kcal >= 60 && !list.length && <div className="empty">{t('suggestNone')}</div>}
      {open?.computed && <RecipeDetail c={open.computed} servingsHint={round(open.servings, 2)} onClose={() => setOpen(null)} />}
    </div>
  );
}

const METHODS = ['air-fryer', 'oven', 'pan', 'pot', 'grill', 'no-cook', 'blender'];

/** «What can I cook today?» — pick what you have; recipes ranked by match, sized to what's left today. */
export function CookTab() {
  const { t, n, lang, settings } = useApp();
  const data = useBundle();
  const { lib } = useLibrary();
  const pantry = useLiveQuery<string[], string[]>(() => kvGet<string[]>('pantry', []), [], []);
  const [f, setF] = useState<{ meal: MealType | ''; method: string; maxMinutes: number | '' }>({ meal: '', method: '', maxMinutes: '' });
  const [open, setOpen] = useState<{ c: ComputedRecipe; s: number } | null>(null);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const day = useMemo(() => (data ? summarizeDay(today(), data.entries, data.days.find((d) => d.date === today()), settings) : null), [data, settings]);
  if (!lib || !day) return <div className="empty">{t('loading')}</div>;
  const all = allLibraryIngredients(lib);
  const toggle = (name: string) => kvSet('pantry', pantry.includes(name) ? pantry.filter((x) => x !== name) : [...pantry, name]);
  const results = whatCanICook(lib, pantry, day.remaining, f);
  const nq = normalizeText(q);
  return (
    <div data-testid="cook">
      <Card title={<><Icon name="grid" />{t('cookTitle')}</>}>
        <div className="tiny muted" style={{ marginBottom: 6 }}>{t('cookHint')}</div>
        <div className="search-field"><Icon name="search" /><input className="input" placeholder={t('search') + '…'} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {/* No inner scroll box: nested scrolling traps touch swipes on small phones. */}
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }} data-testid="pantry">
          {(() => {
            const filtered = all.filter((i) => !nq || normalizeText(i).includes(nq));
            const visible = showAll || nq ? filtered : [...pantry.filter((p) => filtered.includes(p)), ...filtered.filter((i) => !pantry.includes(i)).slice(0, 20)];
            return visible.map((i) => (
              <button key={i} className={`chip ${pantry.includes(i) ? 'active' : ''}`} onClick={() => toggle(i)} data-testid="pantry-chip">{i}</button>
            ));
          })()}
          {!nq && <button className="chip" onClick={() => setShowAll((x) => !x)} data-testid="pantry-more">{showAll ? t('showLess') : t('showAll', { n: all.length })}</button>}
        </div>
        <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
          <span className="small">{t('selectedN', { n: pantry.length })}</span>
          {pantry.length > 0 && <button className="btn sm ghost" onClick={() => kvSet('pantry', [])}>{t('clearPlan')}</button>}
        </div>
        <div className="grid3" style={{ marginTop: 8 }}>
          <label className="field"><span>{t('meal')}</span><select className="input" value={f.meal} onChange={(e) => setF({ ...f, meal: e.target.value as MealType | '' })}><option value="">{t('all')}</option>{MEALS.map((m) => <option key={m} value={m}>{t(m)}</option>)}</select></label>
          <label className="field"><span>{t('method')}</span><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="">{t('all')}</option>{METHODS.map((m) => <option key={m} value={m}>{t('method_' + m.replace('-', '_'))}</option>)}</select></label>
          <NumField label={t('maxMinutes')} value={f.maxMinutes} onChange={(v) => setF({ ...f, maxMinutes: v })} />
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>{t('remainingNow', { kcal: n(Math.max(0, day.remaining.kcal)), p: n(Math.max(0, day.remaining.protein)), c: n(Math.max(0, day.remaining.carbs)), f: n(Math.max(0, day.remaining.fat)) })}</div>
      </Card>
      {!pantry.length && <div className="empty">{t('cookEmpty')}</div>}
      {pantry.length > 0 && results.slice(0, 30).map((r) => (
        <div key={r.c.lib.id} className="card clickable" style={{ cursor: 'pointer' }} onClick={() => setOpen({ c: r.c, s: r.servings ?? 1 })} data-testid="cook-result">
          <div className="row">
            <RecipeMosaic ingredients={r.c.lib.ingredients} size={60} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="bold">{lang === 'ar' ? r.c.lib.nameAr : r.c.lib.nameEn}</div>
              <div className="small num"><b>{n(r.macros.kcal)}</b> {t('kcalUnit')} · <MacroLine m={r.macros} compact /> {r.servings && r.servings !== 1 ? `· ${t('servingsX', { n: n(r.servings, 2) })}` : ''}</div>
              <div className="tiny muted">{r.c.totalTime} {t('min')} · {r.c.lib.methods.map((m) => t('method_' + m.replace('-', '_'))).join('، ')}</div>
              {r.missing.length > 0 && <div className="tiny" data-testid="cook-missing">{t('missingShort')}: {r.missing.map((m) => (m.swap ? `${m.name} → ${m.swap}` : m.name)).join('، ')}</div>}
            </div>
            <span className={`chip ${r.matchPct === 100 ? 'good' : 'warn'}`} data-testid="cook-match">{r.matchPct}%</span>
          </div>
        </div>
      ))}
      {pantry.length > 0 && !results.length && <div className="empty">{t('suggestNone')}</div>}
      {open && <RecipeDetail c={open.c} servingsHint={open.s} onClose={() => setOpen(null)} />}
    </div>
  );
}
