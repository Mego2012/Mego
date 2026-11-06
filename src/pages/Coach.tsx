import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useBundle } from '../app/hooks';
import { Card, EmptyState, MacroLine, Segmented, Sheet, Skeleton } from '../components/ui';
import { allowedFoods, completeMacros, dailyCoach, monthlyCoach, tipOfDay, weeklyCoach, type CoachMessage, type FoodSuggestion } from '../lib/coach';
import { today, monthKey } from '../lib/dates';
import { ARTICLES, SOURCES, type Article } from '../lib/education';
import { AA_REFERENCE, aminoAcidScore, goalClass, loadIntelFoods, nrf93, prosCons, rankFoods, RANKINGS, type GoalClass, type IntelFood, type Ranked, type RankingKind } from '../lib/foodIntel';
import { summarizeDay } from '../lib/reports';

type Tab = 'today' | 'week' | 'month' | 'foods' | 'learn';

/** Loads the Food Intelligence data (USDA, cached offline after the first load). */
function useIntelFoods() {
  const { lang } = useApp();
  const [state, setState] = useState<{ foods: IntelFood[] | null; error: boolean }>({ foods: null, error: false });
  useEffect(() => {
    let alive = true;
    loadIntelFoods(lang).then((foods) => alive && setState({ foods, error: false })).catch(() => alive && setState({ foods: null, error: true }));
    return () => { alive = false; };
  }, [lang]);
  return state;
}

export default function Coach() {
  const { t } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'today';
  const setTab = (x: Tab) => setParams((p) => { p.set('tab', x); return p; }, { replace: true });
  const intel = useIntelFoods();
  return (
    <div data-testid="coach">
      <div style={{ marginBottom: 12 }}>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'today', label: t('coach_today') }, { value: 'week', label: t('coach_week') }, { value: 'month', label: t('coach_month') },
          { value: 'foods', label: t('coach_foods') }, { value: 'learn', label: t('coach_learn') }
        ]} />
      </div>
      {intel.error && tab !== 'learn' && <div className="notice warn small" style={{ marginBottom: 10 }}>{t('refDbOffline')}</div>}
      {tab === 'today' && <TodayTab foods={intel.foods} />}
      {tab === 'week' && <WeekTab />}
      {tab === 'month' && <MonthTab />}
      {tab === 'foods' && (intel.foods ? <FoodsTab foods={intel.foods} /> : <Skeleton lines={6} />)}
      {tab === 'learn' && <LearnTab />}
    </div>
  );
}

function Message({ m }: { m: CoachMessage }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className={`coach-msg ${m.level}`} data-testid="coach-msg" data-key={m.key}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
        <div className="grow">{t(m.key, m.params)}</div>
        <span className={`chip ${m.basis === 'data' ? 'good' : ''}`} title={t('basis_' + m.basis)}>{t('basis_' + m.basis)}</span>
      </div>
      {m.sourceKey && <div className="tiny muted" style={{ marginTop: 4 }}>{t('sourceLabel')}: {t(m.sourceKey)}</div>}
      {!!m.foods?.length && (
        <>
          <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setOpen(!open)} data-testid="coach-options">{open ? '▾' : '▸'} {t('co_options', { n: m.foods.length })}</button>
          {open && <SuggestionList items={m.foods} />}
        </>
      )}
    </div>
  );
}

function SuggestionList({ items }: { items: FoodSuggestion[] }) {
  const { t, n } = useApp();
  return (
    <ul className="list" data-testid="coach-suggestions">
      {items.map((s) => (
        <li key={s.food.item.id}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="bold">{s.food.name} · <span className="num">{n(s.grams)} {t('g')}</span></div>
            <div className="tiny muted"><MacroLine m={s.macros} compact /> · {t(s.reasonKey)}</div>
          </div>
          <span className="num bold">{n(s.macros.kcal)}</span>
        </li>
      ))}
    </ul>
  );
}

function TodayTab({ foods }: { foods: IntelFood[] | null }) {
  const { t, settings, n } = useApp();
  const data = useBundle();
  const date = today();
  const view = useMemo(() => {
    if (!data || !foods) return null;
    const allowed = allowedFoods(foods, settings.diet ?? 'any', settings.foodExclusions ?? []);
    const day = summarizeDay(date, data.entries.filter((e) => e.date === date), data.days.find((d) => d.date === date), settings);
    return { msgs: dailyCoach(data, date, foods), combos: completeMacros(day.remaining, allowed, goalClass(settings.profile.goalType)), day };
  }, [data, foods, settings, date]);
  if (!view) return <Skeleton lines={5} />;
  return (
    <>
      <Card title={`💡 ${t('coach_tipTitle')}`}>
        <div data-testid="coach-tip">{t(tipOfDay(date))}</div>
        <div className="tiny muted" style={{ marginTop: 4 }}>{t('basis_guidance')}</div>
      </Card>
      <Card title={t('coach_todayTitle')}>
        <div className="stack" style={{ gap: 8 }}>{view.msgs.map((m) => <Message key={m.id} m={m} />)}</div>
      </Card>
      {view.combos.length > 0 && (
        <Card title={t('coach_completeTitle')}>
          <div className="tiny muted" style={{ marginBottom: 8 }}>{t('coach_completeHint', { p: n(Math.max(0, view.day.remaining.protein)), c: n(Math.max(0, view.day.remaining.carbs)), f: n(Math.max(0, view.day.remaining.fat)), kcal: n(Math.max(0, view.day.remaining.kcal)) })}</div>
          <div className="stack" style={{ gap: 10 }} data-testid="coach-combos">
            {view.combos.map((c, i) => (
              <div key={i} className="coach-combo" data-testid="coach-combo">
                <div className="small bold">{t('coach_option', { n: i + 1 })}</div>
                <SuggestionList items={c.items} />
                <div className="tiny"><b>{t('total')}:</b> <MacroLine m={c.total} compact /> · {n(c.total.kcal)} {t('kcalUnit')}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function WeekTab() {
  const { t } = useApp();
  const data = useBundle();
  const review = useMemo(() => (data ? weeklyCoach(data, today()) : null), [data]);
  if (!review) return <Skeleton lines={5} />;
  return (
    <Card title={t('coach_weekTitle')}>
      <div className="tiny muted" style={{ marginBottom: 8 }}>{t('coach_weekBasis', { n: review.report.completeDays })}</div>
      <div className="stack" style={{ gap: 8 }} data-testid="coach-week">{review.messages.map((m) => <Message key={m.id} m={m} />)}</div>
    </Card>
  );
}

function MonthTab() {
  const { t } = useApp();
  const data = useBundle();
  const msgs = useMemo(() => (data ? monthlyCoach(data, monthKey(today()), today()) : null), [data]);
  if (!msgs) return <Skeleton lines={5} />;
  return (
    <Card title={t('coach_monthTitle')}>
      <div className="stack" style={{ gap: 8 }} data-testid="coach-month">{msgs.map((m) => <Message key={m.id} m={m} />)}</div>
      <div className="tiny muted" style={{ marginTop: 8 }}>{t('coach_noAutoChange')}</div>
    </Card>
  );
}

function FoodsTab({ foods }: { foods: IntelFood[] }) {
  const { t, settings, n } = useApp();
  const [kind, setKind] = useState<RankingKind>('protein');
  const [goal, setGoal] = useState<GoalClass>(goalClass(settings.profile.goalType));
  const [onlyAllowed, setOnlyAllowed] = useState(true);
  const [detail, setDetail] = useState<Ranked | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const list = useMemo(() => rankFoods(onlyAllowed ? allowedFoods(foods, settings.diet ?? 'any', settings.foodExclusions ?? []) : foods, kind, goal), [foods, kind, goal, onlyAllowed, settings]);
  const compared = list.filter((r) => compare.includes(r.food.item.id));
  return (
    <>
      <Card>
        <div className="row wrap" style={{ gap: 6 }} data-testid="rank-kinds">
          {RANKINGS.map((k) => <button key={k} className={`chip clickable ${k === kind ? 'on' : ''}`} onClick={() => setKind(k)} data-testid={`rank-${k}`}>{t('rank_' + k)}</button>)}
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
          <span className="small muted">{t('rank_goal')}</span>
          <Segmented value={goal} onChange={setGoal} options={[{ value: 'cut', label: t('gc_cut') }, { value: 'maintain', label: t('gc_maintain') }, { value: 'build', label: t('gc_build') }]} />
        </div>
        <label className="check"><input type="checkbox" checked={onlyAllowed} onChange={(e) => setOnlyAllowed(e.target.checked)} />{t('rank_onlyMyDiet')}</label>
        <div className="tiny muted">{t('rank_explain_' + kind)} · {t('rank_noUniversal')}</div>
      </Card>
      {compared.length >= 2 && <CompareTable rows={compared} onClear={() => setCompare([])} />}
      <ul className="list rank-list" data-testid="rank-list">
        {list.map((r) => (
          <li key={r.food.item.id} className="clickable" onClick={() => setDetail(r)} data-testid="rank-row">
            <span className="rank-no num">{r.rank}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="bold">{r.food.name}{(kind === 'protein' || kind === 'building' || kind === 'cutting') && !r.aas && r.food.protein >= 5 && <span className="chip" style={{ marginInlineStart: 6 }} data-testid="no-aa">{t('rank_noAA')}</span>}</div>
              <div className="tiny muted num">{n(r.food.kcal)} {t('kcalUnit')} · P {n(r.food.protein, 1)} · C {n(r.food.carbs, 1)} · F {n(r.food.fat, 1)}{r.food.fiber !== undefined ? ` · ${t('fiber')} ${n(r.food.fiber, 1)}` : ''} / 100 {t('g')}</div>
            </div>
            <div className="stack" style={{ alignItems: 'flex-end', gap: 2 }}>
              <span className="bold num" data-testid="rank-score">{kind === 'nutrientDense' ? n(r.score, 0) : n(r.score, 1)}</span>
              <input type="checkbox" aria-label={t('rank_compare')} checked={compare.includes(r.food.item.id)} onClick={(e) => e.stopPropagation()}
                onChange={(e) => setCompare((c) => (e.target.checked ? [...c, r.food.item.id].slice(-3) : c.filter((x) => x !== r.food.item.id)))} />
            </div>
          </li>
        ))}
      </ul>
      <div className="tiny muted" style={{ margin: '8px 0' }}>{t('rank_sourceNote')}</div>
      {detail && <FoodDetail r={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function CompareTable({ rows, onClear }: { rows: Ranked[]; onClear: () => void }) {
  const { t, n } = useApp();
  const line = (label: string, f: (r: Ranked) => string) => <tr><th>{label}</th>{rows.map((r) => <td key={r.food.item.id} className="num">{f(r)}</td>)}</tr>;
  return (
    <Card title={t('rank_compare')} actions={<button className="btn sm ghost" onClick={onClear}>{t('close')}</button>}>
      <div style={{ overflowX: 'auto' }}>
        <table className="table" data-testid="compare-table"><tbody>
          <tr><th />{rows.map((r) => <th key={r.food.item.id}>{r.food.name}</th>)}</tr>
          {line(t('kcal'), (r) => n(r.food.kcal))}
          {line(t('protein'), (r) => n(r.food.protein, 1))}
          {line(t('carbs'), (r) => n(r.food.carbs, 1))}
          {line(t('fat'), (r) => n(r.food.fat, 1))}
          {line(t('fiber'), (r) => (r.food.fiber === undefined ? '—' : n(r.food.fiber, 1)))}
          {line(t('rank_aas'), (r) => { const a = aminoAcidScore(r.food); return a ? n(a.score * 100, 0) + '%' : '—'; })}
          {line(t('rank_score'), (r) => n(r.score, 1))}
        </tbody></table>
      </div>
    </Card>
  );
}

function FoodDetail({ r, onClose }: { r: Ranked; onClose: () => void }) {
  const { t, n } = useApp();
  const f = r.food;
  const pc = prosCons(f);
  const aas = aminoAcidScore(f);
  const nrf = nrf93(f);
  return (
    <Sheet title={`#${r.rank} · ${f.name}`} onClose={onClose}>
      <div className="stack" data-testid="rank-detail">
        <div className="tiny muted">{f.usdaName} · {f.source} · {t('origin_' + f.item.origin)}</div>
        <div className="grid4">
          {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <div key={k} className="stat"><div className="k">{t(k)}</div><div className="v num">{n(f[k], k === 'kcal' ? 0 : 1)}</div></div>)}
        </div>
        <div className="small bold">{t('rank_breakdown')}</div>
        <ul className="list">
          {r.subs.map((s) => (
            <li key={s.key}><div className="grow small">{t('sub_' + s.key)}</div>
              <span className="tiny muted">{t('rank_weight')} {Math.round(s.weight * 100)}%</span>
              <b className="num" style={{ minWidth: 48, textAlign: 'end' }}>{s.value === undefined ? t('noData') : n(s.value * 100, 0)}</b></li>
          ))}
        </ul>
        {aas ? (
          <div data-testid="aa-detail">
            <div className="small bold">{t('rank_aas')}: {n(aas.score * 100, 0)}% {aas.score < 1 ? `· ${t('rank_limiting')}: ${t('aa_' + aas.limiting)}` : `· ${t('rank_complete')}`}</div>
            <div className="tiny muted">{(Object.keys(AA_REFERENCE) as (keyof typeof AA_REFERENCE)[]).map((k) => `${t('aa_' + k)} ${n(aas.ratios[k] * 100, 0)}%`).join(' · ')}</div>
            <div className="tiny muted">{t('rank_aasNote')}</div>
          </div>
        ) : f.protein >= 5 && <div className="tiny muted">{t('rank_aas')}: {t('noData')}</div>}
        {nrf !== undefined && <div className="small">{t('rank_nrf')}: <b className="num">{n(nrf, 0)}</b></div>}
        {!!pc.pros.length && <><div className="small bold" style={{ color: 'var(--good)' }}>{t('rank_pros')}</div><ul className="small">{pc.pros.map((p) => <li key={p.key}>{t(p.key, p.params)}</li>)}</ul></>}
        {!!pc.cons.length && <><div className="small bold" style={{ color: 'var(--warn)' }}>{t('rank_cons')}</div><ul className="small">{pc.cons.map((p) => <li key={p.key}>{t(p.key, { ...p.params, aa: p.params?.aa ? t('aa_' + p.params.aa) : '' })}</li>)}</ul></>}
        {!!pc.uses.length && <div className="small"><b>{t('rank_uses')}:</b> {pc.uses.map((u) => t(u)).join(' · ')}</div>}
      </div>
    </Sheet>
  );
}

function LearnTab() {
  const { t, lang } = useApp();
  const [open, setOpen] = useState<Article | null>(null);
  if (!ARTICLES.length) return <EmptyState icon="📚" text="—" />;
  return (
    <>
      <div className="grid2" data-testid="learn-list">
        {ARTICLES.map((a) => (
          <button key={a.id} className="card learn-card" onClick={() => setOpen(a)} data-testid={`learn-${a.id}`}>
            <div className="learn-icon" aria-hidden="true">{a.icon}</div>
            <div className="bold">{a.title[lang]}</div>
            <div className="tiny muted">{a.summary[lang]}</div>
          </button>
        ))}
      </div>
      <div className="tiny muted" style={{ marginTop: 8 }}>{t('learn_disclaimer')}</div>
      {open && (
        <Sheet title={`${open.icon} ${open.title[lang]}`} onClose={() => setOpen(null)}>
          <div className="stack" data-testid="article">
            {open.sections.map((s, i) => (
              <div key={i} className="article-sec">
                <span className={`chip ${s.level === 'established' ? 'good' : ''}`}>{t('level_' + s.level)}</span>
                <p style={{ margin: '6px 0' }}>{s[lang]}</p>
                {s.sources?.map((id) => <a key={id} className="tiny" dir="ltr" href={SOURCES[id].url} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'start' }}>↗ {SOURCES[id].cite}</a>)}
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
