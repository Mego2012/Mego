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
