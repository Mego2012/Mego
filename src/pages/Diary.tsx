import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useDayLog, useEntries } from '../app/hooks';
import { FoodPicker, QuantityForm, UnitOptions } from '../components/FoodPicker';
import { Icon } from '../components/icons';
import { Card, Confirm, DateNav, MacroBars, MacroLine, NumField, OptionalNutrientsLine, Segmented, Sheet, StateChip, useAsync } from '../components/ui';
import { addDays, isValidISODate, today } from '../lib/dates';
import { availableUnits, macrosFor } from '../lib/nutrition';
import { db } from '../lib/db';
import {
  addFoodEntry, addRecipeEntry, addWater, copyDay, copyEntries, copyMeal, deleteEntries, deleteEntry, entryToPlanItem, logItems, restoreEntries,
  saveTemplate, updateDayLog, updateEntry
} from '../lib/repo';
import { summarizeDay } from '../lib/reports';
import { MEALS, type DiaryEntry, type Food, type MealTemplate, type MealType, type Recipe, type Unit } from '../lib/types';

export default function Diary() {
  const { t, n, settings, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const date = isValidISODate(params.get('date') ?? '') ? params.get('date')! : today();
  const setDate = (d: string) => setParams((p) => { p.set('date', d); p.delete('add'); return p; }, { replace: true });
  const entries = useEntries(date);
  const log = useDayLog(date);
  const day = useMemo(() => summarizeDay(date, entries, log, settings), [date, entries, log, settings]);
  const [addMeal, setAddMeal] = useState<MealType | null>(params.get('add') ? (params.get('meal') as MealType) || 'breakfast' : null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [copyTarget, setCopyTarget] = useState<{ kind: 'meal' | 'day'; meal?: MealType } | null>(null);
  const [saveMeal, setSaveMeal] = useState<MealType | null>(null);
  const [showTargets, setShowTargets] = useState(false);
  const [pendingCopy, setPendingCopy] = useState<{ to: string; n: number; exec: () => Promise<DiaryEntry[]> } | null>(null);
  const { run } = useAsync();

  /** Copies with a confirmation when the destination day already has entries, then offers Undo. */
  const guardedCopy = async (to: string, exec: () => Promise<DiaryEntry[]>) => {
    const existing = await db.entries.where('date').equals(to).count();
    if (existing > 0) setPendingCopy({ to, n: existing, exec });
    else await doCopy(exec);
  };
  const doCopy = async (exec: () => Promise<DiaryEntry[]>) => {
    const created = await run(exec);
    if (created) toast(t('copied', { n: created.length }), { label: t('undo'), run: async () => { await deleteEntries(created.map((c) => c.id)); toast(t('undone')); } });
  };

  const byMeal = (m: MealType) => entries.filter((e) => e.meal === m);

  return (
    <div data-testid="diary">
      <DateNav date={date} onChange={setDate} testId="diary-date" />

      <Card>
        <div className="row between wrap" style={{ marginBottom: 8, gap: 6 }}>
          <div className="row" style={{ gap: 6 }}>
            <select className="input" style={{ width: 'auto', minHeight: 34, padding: '4px 10px' }} value={log?.dayType ?? ''} aria-label={t('dayType')}
              onChange={(e) => updateDayLog(date, { dayType: (e.target.value || undefined) as never })} data-testid="daytype-select">
              <option value="">{t(day.dayType)} ({t('useDefault')})</option>
              <option value="training">{t('training')}</option>
              <option value="rest">{t('rest')}</option>
            </select>
            <button className="btn sm ghost" onClick={() => setShowTargets(true)}>{t('targetsForDay')}</button>
          </div>
          <span className={`chip status-${day.status}`} data-testid="day-status">{t('status_' + day.status)}</span>
        </div>
        <MacroBars totals={day.totals} target={day.target} keys={['kcal', 'protein', 'carbs', 'fat']} />
        <OptionalNutrientsLine m={day.totals} coverage={day.coverage} total={day.entryCount} />
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="small">💧 <b className="num" data-testid="diary-water">{n(day.waterMl)}</b> / {n(settings.waterTargetMl)} {t('ml')}</span>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn sm" onClick={() => run(() => addWater(date, 250))} data-testid="water-250">+250</button>
            <button className="btn sm" onClick={() => run(() => addWater(date, 500))}>+500</button>
          </div>
        </div>
        {day.status === 'empty' && <div className="tiny muted" style={{ marginTop: 8 }}>{t('dayIsEmpty')}</div>}
        <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
          <button className="btn sm" onClick={() => guardedCopy(date, () => copyDay(addDays(date, -1), date))} data-testid="copy-yesterday">
            <Icon name="copy" /> {t('copyFromYesterday')}
          </button>
          <button className="btn sm" onClick={() => setCopyTarget({ kind: 'day' })} disabled={!entries.length}>{t('copyDayTo')}</button>
          {day.status !== 'complete' && entries.length > 0 && <button className="btn sm" onClick={() => updateDayLog(date, { status: 'complete' })} data-testid="mark-complete"><Icon name="check" /> {t('markComplete')}</button>}
          {day.status !== 'partial' && entries.length > 0 && <button className="btn sm" onClick={() => updateDayLog(date, { status: 'partial' })} data-testid="mark-partial">{t('markPartial')}</button>}
          {log?.status && <button className="btn sm ghost" onClick={() => updateDayLog(date, { status: undefined })}>{t('clearStatus')}</button>}
        </div>
      </Card>

      {MEALS.map((m) => (
        <Card key={m} className="meal-card"
          title={<span>{t(m)} <span className="small muted num">· {n(day.byMeal[m].kcal)} {t('kcalUnit')}</span></span>}
          actions={<>
            {byMeal(m).length > 0 && <button className="icon-btn" onClick={() => setCopyTarget({ kind: 'meal', meal: m })} aria-label={t('copyMealTo')} title={t('copyMealTo')}><Icon name="copy" /></button>}
            {byMeal(m).length > 0 && <button className="icon-btn" onClick={() => setSaveMeal(m)} aria-label={t('saveAsMeal')} title={t('saveAsMeal')}><Icon name="star" /></button>}
            <button className="btn sm primary" onClick={() => setAddMeal(m)} data-testid={`add-${m}`}>+ {t('add')}</button>
          </>}>
          <div data-testid={`meal-${m}`}>
            {byMeal(m).map((e) => (
              <div key={e.id} className="entry" onClick={() => setEditing(e)} data-testid="entry">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}><span className="ellipsis bold" data-testid="entry-name">{e.name}</span>{e.state !== 'other' && <StateChip state={e.state} />}</div>
                  <div className="tiny muted num">{n(e.quantity, 2)} {t('unit_' + e.unit)}{e.unit !== 'g' && e.grams ? ` (${n(e.grams)} ${t('g')})` : ''} · <MacroLine m={e.macros} compact /></div>
                </div>
                <span className="num bold" data-testid="entry-kcal">{n(e.macros.kcal)}</span>
              </div>
            ))}
            {!byMeal(m).length && <div className="tiny muted">{t('noEntries')}</div>}
          </div>
        </Card>
      ))}

      {addMeal && <AddSheet date={date} meal={addMeal} onMeal={setAddMeal} onClose={() => setAddMeal(null)} />}
      {editing && <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />}
      {copyTarget && (
        <CopySheet title={copyTarget.kind === 'day' ? t('copyDayTo') : t('copyMealTo')} defaultMeal={copyTarget.meal} showMeal={copyTarget.kind === 'meal'} date={date}
          onClose={() => setCopyTarget(null)}
          onCopy={async (to, toMeal) => {
            const kind = copyTarget.kind;
            const meal = copyTarget.meal!;
            setCopyTarget(null);
            await guardedCopy(to, () => (kind === 'day' ? copyDay(date, to) : copyMeal(date, meal, to, toMeal)));
          }} />
      )}
      {saveMeal && (
        <NameSheet title={t('saveAsMeal')} label={t('savedMealName')} initial={t(saveMeal)} onClose={() => setSaveMeal(null)}
          onSave={async (name) => {
            await saveTemplate({ name, items: byMeal(saveMeal).map(entryToPlanItem), favorite: true });
            toast(t('saved'));
            setSaveMeal(null);
          }} />
      )}
      {showTargets && <DayTargetsSheet date={date} onClose={() => setShowTargets(false)} />}
      {pendingCopy && (
        <Confirm message={t('confirmCopyIntoNonEmpty', { date: pendingCopy.to, n: pendingCopy.n })} onNo={() => setPendingCopy(null)}
          onYes={async () => { const p = pendingCopy; setPendingCopy(null); await doCopy(p.exec); }} />
      )}
    </div>
  );
}

function AddSheet({ date, meal, onMeal, onClose }: { date: string; meal: MealType; onMeal: (m: MealType) => void; onClose: () => void }) {
  const { t, toast } = useApp();
  const [food, setFood] = useState<Food | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState<number | ''>(1);
  const { run } = useAsync();

  const addTemplate = async (tp: MealTemplate) => {
    const r = await logItems(date, tp.items, meal);
    toast(`${t('logged', { n: r.logged.length })}${r.skipped.length ? ` (−${r.skipped.length})` : ''}`, { label: t('undo'), run: () => deleteEntries(r.logged.map((x) => x.id)) });
    onClose();
  };
  const addHistory = async (e: DiaryEntry) => {
    const r = await logItems(date, [entryToPlanItem(e)], meal);
    if (r.logged.length) toast(`${t('added')}: ${e.name}`, { label: t('undo'), run: () => deleteEntries(r.logged.map((x) => x.id)) });
    else toast(t('error'));
  };

  return (
    <Sheet title={`${t('addFood')} — ${t(meal)}`} onClose={onClose}>
      <div style={{ marginBottom: 10 }}>
        <Segmented value={meal} options={MEALS.map((m) => ({ value: m, label: t(m) }))} onChange={onMeal} />
      </div>
      {!food && !recipe && <FoodPicker onPickFood={setFood} onPickRecipe={setRecipe} onPickTemplate={addTemplate} onPickHistory={addHistory} />}
      {food && (
        <QuantityForm food={food} submitLabel={t('logFood')} onBack={() => setFood(null)}
          onSubmit={async (q, u, s) => {
            const ok = await run(() => addFoodEntry(date, meal, food, q, u, s));
            if (ok) { toast(`${t('added')}: ${food.nameAr || food.nameEn}`, { label: t('undo'), run: () => deleteEntry(ok.id) }); setFood(null); }
          }} />
      )}
      {recipe && (
        <div className="stack">
          <div className="bold">{recipe.name}</div>
          <NumField label={t('logServings')} value={servings} onChange={setServings} testId="recipe-servings" />
          {servings !== '' && servings > 0 && <div className="stat"><b className="num">{Math.round(recipe.perServing.kcal * servings)} {t('kcalUnit')}</b></div>}
          <div className="row">
            <button className="btn" onClick={() => setRecipe(null)}>{t('previous')}</button>
            <button className="btn primary grow" disabled={!(servings && servings > 0)} data-testid="recipe-log"
              onClick={async () => { const e = await run(() => addRecipeEntry(date, meal, recipe, Number(servings))); if (e) toast(t('added'), { label: t('undo'), run: () => deleteEntry(e.id) }); setRecipe(null); }}>{t('logFood')}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function EditEntrySheet({ entry, onClose }: { entry: DiaryEntry; onClose: () => void }) {
  const { t, n, toast } = useApp();
  const [copyTo, setCopyTo] = useState(false);
  const [qty, setQty] = useState<number | ''>(entry.quantity);
  const [unit, setUnit] = useState<Unit>(entry.unit);
  const [meal, setMeal] = useState<MealType>(entry.meal);
  const [date, setDate] = useState(entry.date);
  const [confirm, setConfirm] = useState(false);
  const { run } = useAsync();
  const units = availableUnits(entry.basis);
  let preview = null;
  try { if (qty !== '') preview = macrosFor(entry.basis, qty, unit, entry.servingId); } catch { /* invalid */ }
  return (
    <Sheet title={entry.name} onClose={onClose}>
      <div className="stack" data-testid="edit-entry">
        <div className="tiny muted">{t('snapshotNote')}</div>
        <div className="grid2">
          <label className="field"><span>{t('quantity')}</span>
            <input className="input num" type="number" inputMode="decimal" step="any" value={qty} data-testid="edit-qty" onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))} /></label>
          <label className="field"><span>{t('unit')}</span>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}><UnitOptions basis={entry.basis} units={units} /></select></label>
          <label className="field"><span>{t('meal')}</span>
            <select className="input" value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>{MEALS.map((m) => <option key={m} value={m}>{t(m)}</option>)}</select></label>
          <label className="field"><span>{t('date')}</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        {preview && <div className="stat"><b className="num">{n(preview.macros.kcal)} {t('kcalUnit')}</b> <MacroLine m={preview.macros} /></div>}
        <div className="row">
          <button className="btn primary grow" disabled={!preview || !isValidISODate(date)} data-testid="edit-save"
            onClick={async () => {
              const before = structuredClone(entry);
              const ok = await run(() => updateEntry(entry.id, { quantity: Number(qty), unit, meal, date }));
              if (ok) toast(t('saved'), { label: t('undo'), run: () => restoreEntries([before]) });
              onClose();
            }}>{t('save')}</button>
        </div>
        <div className="row">
          <button className="btn grow" onClick={async () => { const c = await run(() => copyEntries([entry], entry.date)); if (c) toast(t('copied', { n: 1 }), { label: t('undo'), run: () => deleteEntries(c.map((x) => x.id)) }); onClose(); }} data-testid="entry-duplicate"><Icon name="copy" /> {t('duplicate')}</button>
          <button className="btn grow" onClick={() => setCopyTo(true)} data-testid="entry-copy-to">{t('copyToDate')}</button>
          <button className="btn danger grow" onClick={() => setConfirm(true)} data-testid="entry-delete"><Icon name="trash" /> {t('delete')}</button>
        </div>
      </div>
      {confirm && <Confirm danger message={`${t('delete')}: ${entry.name}?`} onNo={() => setConfirm(false)} onYes={async () => {
        const before = structuredClone(entry);
        await deleteEntry(entry.id);
        toast(t('deleted'), { label: t('undo'), run: () => restoreEntries([before]) });
        onClose();
      }} />}
      {copyTo && <CopySheet title={t('copyToDate')} date={entry.date} defaultMeal={entry.meal} showMeal onClose={() => setCopyTo(false)}
        onCopy={async (to, toMeal) => { const c = await run(() => copyEntries([entry], to, toMeal)); if (c) toast(t('copied', { n: 1 }), { label: t('undo'), run: () => deleteEntries(c.map((x) => x.id)) }); setCopyTo(false); onClose(); }} />}
    </Sheet>
  );
}

export function CopySheet({ title, date, defaultMeal, showMeal, onCopy, onClose }: { title: string; date: string; defaultMeal?: MealType; showMeal: boolean; onCopy: (to: string, meal: MealType) => void; onClose: () => void }) {
  const { t } = useApp();
  const [to, setTo] = useState(addDays(date, 1));
  const [meal, setMeal] = useState<MealType>(defaultMeal ?? 'breakfast');
  return (
    <Sheet title={title} onClose={onClose} footer={<button className="btn primary block" disabled={!isValidISODate(to)} onClick={() => onCopy(to, meal)} data-testid="copy-confirm">{t('copy')}</button>}>
      <div className="stack">
        <label className="field"><span>{t('date')}</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="copy-date" /></label>
        {showMeal && <Segmented value={meal} options={MEALS.map((m) => ({ value: m, label: t(m) }))} onChange={setMeal} />}
      </div>
    </Sheet>
  );
}

export function NameSheet({ title, label, initial = '', onSave, onClose }: { title: string; label: string; initial?: string; onSave: (name: string) => void; onClose: () => void }) {
  const { t } = useApp();
  const [name, setName] = useState(initial);
  return (
    <Sheet title={title} onClose={onClose} footer={<button className="btn primary block" disabled={!name.trim()} onClick={() => onSave(name.trim())} data-testid="name-save">{t('save')}</button>}>
      <label className="field"><span>{label}</span><input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} data-testid="name-input" /></label>
    </Sheet>
  );
}

function DayTargetsSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { t, settings } = useApp();
  const log = useDayLog(date);
  const base = log?.targetsOverride ?? settings.targets[log?.dayType ?? 'training'];
  const [v, setV] = useState({ ...base });
  return (
    <Sheet title={t('targetsForDay')} onClose={onClose} footer={<>
      <button className="btn grow" onClick={async () => { await updateDayLog(date, { targetsOverride: undefined }); onClose(); }}>{t('useDefault')}</button>
      <button className="btn primary grow" onClick={async () => { await updateDayLog(date, { targetsOverride: v }); onClose(); }}>{t('save')}</button>
    </>}>
      <div className="grid2">
        {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
          <NumField key={k} label={t(k)} value={v[k]} onChange={(x) => setV({ ...v, [k]: Number(x) || 0 })} />
        ))}
      </div>
    </Sheet>
  );
}

