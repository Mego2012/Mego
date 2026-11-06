import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useBundle } from '../app/hooks';
import { Card, Delta, Sheet, useAsync } from '../components/ui';
import { db } from '../lib/db';
import { addDays, startOfWeek, today, weekDates } from '../lib/dates';
import { applyPlanToDates, copyPlannedDay, deletePlan, logItems, savePlan, setPlannedDay, totalsForItems } from '../lib/repo';
import { summarizeDay } from '../lib/reports';
import type { DayPlan, DayType, Macros, PlannedDay } from '../lib/types';
import { CopySheet } from './Diary';
import { useLibrary } from './RecipeLibrary';
import { applyGeneratedPlan, generatePlan, shoppingList, type GeneratedDay, type ShoppingItem } from '../lib/recipeEngine';
import { kvGet, kvSet } from '../lib/repo';
import { targetsFor } from '../lib/targets';
import { LIBRARY } from '../lib/recipeLibraryData';
import { Confirm, MacroLine, StateChip } from '../components/ui';
import { ItemsEditor } from './Recipes';

export default function Planner() {
  const { t, n, d, settings, toast } = useApp();
  const [anchor, setAnchor] = useState(today());
  const start = startOfWeek(anchor, settings.weekStartsOn);
  const dates = weekDates(start);
  const planned = useLiveQuery(() => db.plannedDays.where('date').between(dates[0], dates[6], true, true).toArray(), [dates[0]], []);
  const plans = useLiveQuery(() => db.plans.orderBy('name').toArray(), [], []);
  const data = useBundle();
  const [totals, setTotals] = useState<Record<string, Macros>>({});
  const [editDay, setEditDay] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<DayPlan | 'new' | null>(null);
  const [applyPlan, setApplyPlan] = useState<DayPlan | null>(null);
  const [generated, setGenerated] = useState<GeneratedDay[] | null>(null);
  const [shopping, setShopping] = useState(false);
  const { lib } = useLibrary();
  const { run } = useAsync();

  useEffect(() => {
    Promise.all(planned.map(async (p) => [p.date, (await totalsForItems(p.items)).total] as const)).then((x) => setTotals(Object.fromEntries(x)));
  }, [planned]);

  const byDate = new Map<string, PlannedDay>(planned.map((p) => [p.date, p]));
  const editing = editDay ? byDate.get(editDay) : undefined;

  return (
    <div data-testid="planner-page">
      <div className="datenav">
        <button className="btn sm" onClick={() => setAnchor(addDays(start, -7))}>{t('previous')}</button>
        <div className="label small">{d(dates[0], { day: 'numeric', month: 'short' })} – {d(dates[6], { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <button className="btn sm" onClick={() => setAnchor(addDays(start, 7))}>{t('next')}</button>
      </div>

      <div className="row wrap" style={{ marginBottom: 12 }}>
        <button className="btn primary grow" disabled={!lib} data-testid="generate-plan"
          onClick={() => lib && setGenerated(generatePlan(dates.filter((x) => x >= today()), (dt) => targetsFor(dt, settings, data?.days.find((y) => y.date === dt)), lib))}>✨ {t('generatePlan')}</button>
        <button className="btn grow" onClick={() => setShopping(true)} data-testid="open-shopping">🛒 {t('shoppingList')}</button>
      </div>

      <Card title={t('weekPlan')}>
        <div className="table-wrap">
          <table className="tbl" data-testid="plan-table">
            <thead><tr><th>{t('date')}</th><th>{t('planned')}</th><th>{t('actual')}</th><th>{t('difference')}</th><th>{t('protein')} {t('planned')}/{t('actual')}</th></tr></thead>
            <tbody>
              {dates.map((dt) => {
                const p = totals[dt];
                const log = data?.days.find((x) => x.date === dt);
                const act = data ? summarizeDay(dt, data.entries, log, settings) : null;
                return (
                  <tr key={dt} data-testid={`plan-row-${dt}`}>
                    <td><div className="bold">{d(dt, { weekday: 'short', day: 'numeric' })}</div><div className="tiny muted">{act ? t(act.dayType) : ''}</div></td>
                    <td className="num">{p ? n(p.kcal) : '—'}</td>
                    <td className="num">{act && act.status !== 'empty' ? n(act.totals.kcal) : '—'}</td>
                    <td>{p && act && act.status !== 'empty' ? <Delta value={Math.round(act.totals.kcal - p.kcal)} digits={0} /> : '—'}</td>
                    <td className="num small">{p ? n(p.protein) : '—'} / {act && act.status !== 'empty' ? n(act.totals.protein) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {dates.map((dt) => {
        const p = byDate.get(dt);
        const plan = p?.planId ? plans.find((x) => x.id === p.planId) : undefined;
        return (
          <Card key={dt} title={<span>{d(dt, { weekday: 'long', day: 'numeric', month: 'short' })}</span>}
            actions={<span className="small muted num">{totals[dt] ? `${n(totals[dt].kcal)} ${t('kcalUnit')}` : t('noPlan')}</span>}>
            {p && <div className="tiny muted" style={{ marginBottom: 6 }}>{plan ? `${t('fromPlan')}: ${plan.name} · ` : ''}{p.items.map((i) => i.name).join(' · ')}</div>}
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => setEditDay(dt)} data-testid={`plan-edit-${dt}`}>{t('edit')}</button>
              {p && <button className="btn sm" onClick={() => setCopyFrom(dt)}>{t('copyPlanTo')}</button>}
              {p && <button className="btn sm primary" data-testid={`plan-log-${dt}`} onClick={async () => { const r = await logItems(dt, p.items); toast(`${t('added')}: ${r.logged.length}`); }}>{t('logPlanned')}</button>}
              {p && <button className="btn sm ghost" onClick={() => setPlannedDay(dt, [])}>{t('clearPlan')}</button>}
            </div>
          </Card>
        );
      })}

      <Card title={t('dayPlans')} actions={<button className="btn sm primary" onClick={() => setEditPlan('new')} data-testid="new-plan">+ {t('newPlan')}</button>}>
        <ul className="list">
          {plans.map((p) => (
            <li key={p.id}>
              <div className="grow"><div className="bold">{p.name}</div><div className="tiny muted">{p.dayType === 'any' ? t('anyDay') : t(p.dayType)} · {p.items.length} {t('items')}</div></div>
              <button className="btn sm" onClick={() => setEditPlan(p)}>{t('edit')}</button>
              <button className="btn sm primary" onClick={() => setApplyPlan(p)} data-testid="plan-apply">{t('applyToDays')}</button>
            </li>
          ))}
          {!plans.length && <li className="empty">—</li>}
        </ul>
      </Card>

      {editDay && (
        <ItemsEditor title={t('editPlanFor', { date: d(editDay) })} initialName={editing?.planId ? plans.find((x) => x.id === editing.planId)?.name ?? d(editDay) : d(editDay)}
          initialItems={editing?.items ?? []} onClose={() => setEditDay(null)}
          onSave={async (_name, items) => { await setPlannedDay(editDay, items, editing?.planId); setEditDay(null); }} />
      )}
      {copyFrom && <CopySheet title={t('copyPlanTo')} date={copyFrom} showMeal={false} onClose={() => setCopyFrom(null)}
        onCopy={async (to) => { await run(() => copyPlannedDay(copyFrom, to), t('saved')); setCopyFrom(null); }} />}
      {editPlan && <PlanEditor plan={editPlan === 'new' ? null : editPlan} onClose={() => setEditPlan(null)} />}
      {applyPlan && <ApplySheet plan={applyPlan} dates={dates} onClose={() => setApplyPlan(null)} />}
      {generated && <GeneratedSheet days={generated} hasExisting={generated.some((g) => byDate.has(g.date))} onClose={() => setGenerated(null)} />}
      {shopping && <ShoppingSheet dates={dates} weekKey={dates[0]} onClose={() => setShopping(false)} />}
    </div>
  );
}

function PlanEditor({ plan, onClose }: { plan: DayPlan | null; onClose: () => void }) {
  const { t } = useApp();
  const [dayType, setDayType] = useState<DayType | 'any'>(plan?.dayType ?? 'any');
  return (
    <ItemsEditor title={plan ? plan.name : t('newPlan')} initialName={plan?.name ?? ''} initialItems={plan?.items ?? []} onClose={onClose}
      onDelete={plan ? async () => { await deletePlan(plan.id); onClose(); } : undefined}
      extra={<label className="field"><span>{t('dayType')}</span>
        <select className="input" value={dayType} onChange={(e) => setDayType(e.target.value as DayType | 'any')}>
          <option value="any">{t('anyDay')}</option><option value="training">{t('training')}</option><option value="rest">{t('rest')}</option>
        </select></label>}
      onSave={async (name, items) => { await savePlan({ id: plan?.id, name, dayType, items }); onClose(); }} />
  );
}

function ApplySheet({ plan, dates, onClose }: { plan: DayPlan; dates: string[]; onClose: () => void }) {
  const { t, d, settings, toast } = useApp();
  const [sel, setSel] = useState<string[]>(() =>
    dates.filter((dt) => plan.dayType === 'any' || (settings.trainingWeekdays.includes(new Date(dt + 'T12:00').getDay()) ? 'training' : 'rest') === plan.dayType)
  );
  return (
    <Sheet title={`${t('applyToDays')} — ${plan.name}`} onClose={onClose} footer={
      <button className="btn primary block" disabled={!sel.length} data-testid="apply-confirm" onClick={async () => { await applyPlanToDates(plan.id, sel); toast(t('saved')); onClose(); }}>{t('apply')} ({sel.length})</button>}>
      {dates.map((dt) => (
        <label key={dt} className="check"><input type="checkbox" checked={sel.includes(dt)} onChange={(e) => setSel(e.target.checked ? [...sel, dt] : sel.filter((x) => x !== dt))} />{d(dt, { weekday: 'long', day: 'numeric', month: 'short' })}</label>
      ))}
    </Sheet>
  );
}

function GeneratedSheet({ days, hasExisting, onClose }: { days: GeneratedDay[]; hasExisting: boolean; onClose: () => void }) {
  const { t, n, d, lang, settings, toast } = useApp();
  const [confirm, setConfirm] = useState(false);
  const { run, busy } = useAsync();
  const name = (id: string) => { const l = LIBRARY.find((x) => x.id === id)!; return `${l.emoji} ${lang === 'ar' ? l.nameAr : l.nameEn}`; };
  const apply = async () => { if (await run(async () => { await applyGeneratedPlan(days); return true; })) { toast(t('saved')); onClose(); } };
  return (
    <Sheet title={t('generatedPreview')} onClose={onClose} footer={<button className="btn primary block" disabled={busy || !days.length} data-testid="apply-generated" onClick={() => (hasExisting ? setConfirm(true) : apply())}>{t('applyPlan')}</button>}>
      <div className="stack" data-testid="generated-plan">
        {days.map((g) => {
          const T = settings.targets.training;
          return (
            <div key={g.date} className="stat">
              <div className="row between"><b>{d(g.date)}</b><span className="small num">{t('dayTotal')}: {n(g.total.kcal)} {t('kcalUnit')} · {t('protein')} {n(g.total.protein)}{t('g')}</span></div>
              {g.picks.map((p) => <div key={p.meal} className="tiny"><span className="muted">{t(p.meal)}:</span> {name(p.libId)} {p.servings !== 1 ? `× ${n(p.servings, 2)}` : ''} — {n(p.macros.kcal)} {t('kcalUnit')}</div>)}
              <div className="tiny muted"><MacroLine m={g.total} compact /> · {t('target')} {n(T.kcal)}/{n(T.protein)}</div>
            </div>
          );
        })}
        {!days.length && <div className="empty">{t('noData')}</div>}
      </div>
      {confirm && <Confirm message={t('overwritePlanned')} onNo={() => setConfirm(false)} onYes={() => { setConfirm(false); apply(); }} />}
    </Sheet>
  );
}

function ShoppingSheet({ dates, weekKey, onClose }: { dates: string[]; weekKey: string; onClose: () => void }) {
  const { t, n } = useApp();
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const checked = useLiveQuery<string[], string[]>(() => kvGet<string[]>(`shopping:${weekKey}`, []), [weekKey], []);
  useEffect(() => { shoppingList(dates).then(setItems); }, [dates.join()]);
  const toggle = (k: string) => kvSet(`shopping:${weekKey}`, checked.includes(k) ? checked.filter((x) => x !== k) : [...checked, k]);
  return (
    <Sheet title={`🛒 ${t('shoppingList')}`} onClose={onClose}>
      <div className="tiny muted" style={{ marginBottom: 8 }}>{t('shoppingNote')}</div>
      <ul className="list" data-testid="shopping-list">
        {(items ?? []).map((i) => (
          <li key={i.key}>
            <label className="check grow" style={{ textDecoration: checked.includes(i.key) ? 'line-through' : 'none', opacity: checked.includes(i.key) ? 0.55 : 1 }}>
              <input type="checkbox" checked={checked.includes(i.key)} onChange={() => toggle(i.key)} data-testid="shopping-check" />
              <span className="grow">{i.name} {i.state !== 'other' && <StateChip state={i.state} />}</span>
            </label>
            <span className="num bold small">{i.grams >= 1000 ? `${n(i.grams / 1000, 2)} ${t('unit_kg')}` : `${n(i.grams)} ${t('g')}`}</span>
          </li>
        ))}
        {items && !items.length && <li className="empty">{t('noPlan')}</li>}
      </ul>
    </Sheet>
  );
}
