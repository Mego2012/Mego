import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon, type IconName } from '../components/icons';
import { FoodThumb } from '../components/FoodThumb';
import { useApp } from '../app/AppContext';
import { useBundle } from '../app/hooks';
import { EmptyState, MacroLine, Segmented, Sheet, Skeleton } from '../components/ui';
import { allowedFoods, completeMacros, dailyCoach, monthlyCoach, tipOfDay, weeklyCoach, type CoachMessage, type FoodSuggestion } from '../lib/coach';
import { today, monthKey } from '../lib/dates';
import { ARTICLES, SOURCES, type Article } from '../lib/education';
import { AA_REFERENCE, aminoAcidScore, goalClass, loadIntelFoods, nrf93, prosCons, rankFoods, RANKINGS, type GoalClass, type IntelFood, type Ranked, type RankingKind } from '../lib/foodIntel';
import { photoKeyFor } from '../lib/foodPhotos';
import { summarizeDay } from '../lib/reports';

type Tab = 'today' | 'week' | 'month' | 'foods' | 'learn';
const TAB_ICON: Record<Tab, IconName> = { today: 'sparkle', week: 'weekly', month: 'monthly', foods: 'chart', learn: 'book' };

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

/** Photo key for a ranked catalog food (its exact USDA record). */
const intelPhoto = (f: IntelFood) => photoKeyFor({ id: f.item.id, nameEn: f.item.en });

export default function Coach() {
  const { t } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'today';
  const setTab = (x: Tab) => setParams((p) => { p.set('tab', x); return p; }, { replace: true });
  const intel = useIntelFoods();
  return (
    <div data-testid="coach" className="coach">
      <nav className="icon-tabs" role="tablist" aria-label={t('nav_coach')}>
        {(['today', 'week', 'month', 'foods', 'learn'] as Tab[]).map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            <Icon name={TAB_ICON[x]} /><span>{t(x === 'foods' ? 'coach_foodsShort' : 'coach_' + x)}</span>
          </button>
        ))}
      </nav>
      {intel.error && tab !== 'learn' && <div className="notice warn small" style={{ marginBottom: 10 }}>{t('refDbOffline')}</div>}
      {tab === 'today' && <TodayTab foods={intel.foods} />}
      {tab === 'week' && <WeekTab />}
      {tab === 'month' && <MonthTab />}
      {tab === 'foods' && (intel.foods ? <FoodsTab foods={intel.foods} /> : <Skeleton lines={6} />)}
      {tab === 'learn' && <LearnTab />}
    </div>
  );
}

const LEVEL_ICON: Record<string, IconName> = { good: 'check', warn: 'info', info: 'sparkle' };

function Message({ m }: { m: CoachMessage }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <article className={`coach-msg ${m.level}`} data-testid="coach-msg" data-key={m.key}>
      <span className="cm-icon" aria-hidden="true"><Icon name={LEVEL_ICON[m.level] ?? 'info'} /></span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="cm-text">{t(m.key, m.params)}</div>
        <div className="cm-meta">
          <span className={`basis ${m.basis}`}>{t('basis_' + m.basis)}</span>
          {m.sourceKey && <span className="tiny muted">{t('sourceLabel')}: {t(m.sourceKey)}</span>}
        </div>
        {!!m.foods?.length && (
          <>
            <button className="link-btn" style={{ paddingInline: 0 }} onClick={() => setOpen(!open)} data-testid="coach-options" aria-expanded={open}>
              <Icon name={open ? 'close' : 'plus'} /> {t('co_options', { n: m.foods.length })}
            </button>
            {open && <SuggestionList items={m.foods} />}
          </>
        )}
      </div>
    </article>
  );
}

function SuggestionList({ items }: { items: FoodSuggestion[] }) {
  const { t, n } = useApp();
  return (
    <ul className="list sugg-list" data-testid="coach-suggestions">
      {items.map((s) => (
        <li key={s.food.item.id}>
          <FoodThumb photoKey={intelPhoto(s.food)} size={40} />
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
  const rem = view.day.remaining;
  return (
    <>
      <section className="coach-brief">
        <div className="k-label">{t('coach_todayTitle')}</div>
        <div className="brief-grid">
          {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
            <div key={k} className="brief-cell" style={{ ['--c' as string]: `var(--${k})` }}>
              <b className="num">{n(Math.max(0, rem[k]))}</b>
              <span>{t(k)} · {k === 'kcal' ? t('kcalUnit') : t('g')}</span>
            </div>
          ))}
        </div>
        <div className="tiny muted">{t('remaining')}</div>
      </section>
      <div className="stack coach-feed">{view.msgs.map((m) => <Message key={m.id} m={m} />)}</div>
      {view.combos.length > 0 && (
        <section className="coach-section">
          <h2 className="sec-title">{t('coach_completeTitle')}</h2>
          <div className="tiny muted" style={{ marginBottom: 10 }}>{t('coach_completeHint', { p: n(Math.max(0, rem.protein)), c: n(Math.max(0, rem.carbs)), f: n(Math.max(0, rem.fat)), kcal: n(Math.max(0, rem.kcal)) })}</div>
          <div className="combo-grid" data-testid="coach-combos">
            {view.combos.map((c, i) => (
              <div key={i} className="coach-combo" data-testid="coach-combo">
                <div className="combo-head"><span className="combo-no num">{i + 1}</span><span className="small bold">{t('coach_option', { n: i + 1 })}</span><span className="grow" />{c.total.kcal > rem.kcal + 0.5 && <span className="chip warn tiny-chip num">{t('co_overBy', { kcal: n(c.total.kcal - rem.kcal) })}</span>}<b className="num">{n(c.total.kcal)}</b><span className="tiny muted">{t('kcalUnit')}</span></div>
                <SuggestionList items={c.items} />
                <div className="tiny"><b>{t('total')}:</b> <MacroLine m={c.total} compact /></div>
              </div>
            ))}
          </div>
        </section>
      )}
      <aside className="tip-card">
        <span className="tip-icon" aria-hidden="true"><Icon name="bulb" /></span>
        <div>
          <div className="k-label">{t('coach_tipTitle')}</div>
          <div data-testid="coach-tip" className="tip-text">{t(tipOfDay(date))}</div>
          <div className="tiny muted" style={{ marginTop: 4 }}>{t('basis_guidance')}</div>
        </div>
      </aside>
    </>
  );
}

function WeekTab() {
  const { t, n } = useApp();
  const data = useBundle();
  const review = useMemo(() => (data ? weeklyCoach(data, today()) : null), [data]);
  if (!review) return <Skeleton lines={5} />;
  const r = review.report;
  return (
    <>
      <section className="coach-brief">
        <div className="k-label">{t('coach_weekTitle')}</div>
        <div className="brief-grid">
          <div className="brief-cell" style={{ ['--c' as string]: 'var(--primary)' }}><b className="num">{r.completeDays}/7</b><span>{t('completeDays')}</span></div>
          <div className="brief-cell" style={{ ['--c' as string]: 'var(--kcal)' }}><b className="num">{r.averages ? n(r.averages.kcal) : '—'}</b><span>{t('weeklyCalorieAvg')}</span></div>
          <div className="brief-cell" style={{ ['--c' as string]: 'var(--protein)' }}><b className="num">{r.averages ? n(r.averages.protein) : '—'}</b><span>{t('avgProtein')}</span></div>
          <div className="brief-cell" style={{ ['--c' as string]: 'var(--good)' }}><b className="num">{r.calorieConsistencyPct ?? '—'}{r.calorieConsistencyPct !== null ? '%' : ''}</b><span>{t('calorieConsistency')}</span></div>
        </div>
        <div className="tiny muted">{t('coach_weekBasis', { n: r.completeDays })}</div>
      </section>
      <div className="stack coach-feed" data-testid="coach-week">{review.messages.map((m) => <Message key={m.id} m={m} />)}</div>
    </>
  );
}

function MonthTab() {
  const { t } = useApp();
  const data = useBundle();
  const msgs = useMemo(() => (data ? monthlyCoach(data, monthKey(today()), today()) : null), [data]);
  if (!msgs) return <Skeleton lines={5} />;
  return (
    <>
      <section className="coach-brief slim"><div className="k-label">{t('coach_monthTitle')}</div><div className="tiny muted">{t('coach_noAutoChange')}</div></section>
      <div className="stack coach-feed" data-testid="coach-month">{msgs.map((m) => <Message key={m.id} m={m} />)}</div>
    </>
  );
}

const RANK_ICON: Partial<Record<RankingKind, IconName>> = {
  protein: 'flame', carb: 'leaf', fat: 'water', fiber: 'grid', lowCalorie: 'target', proteinPerCalorie: 'compare', nutrientDense: 'sparkle', cutting: 'scale', building: 'chart'
};

function FoodsTab({ foods }: { foods: IntelFood[] }) {
  const { t, settings, n } = useApp();
  const [kind, setKind] = useState<RankingKind>('protein');
  const [goal, setGoal] = useState<GoalClass>(goalClass(settings.profile.goalType));
  const [onlyAllowed, setOnlyAllowed] = useState(true);
  const [detail, setDetail] = useState<Ranked | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const list = useMemo(() => rankFoods(onlyAllowed ? allowedFoods(foods, settings.diet ?? 'any', settings.foodExclusions ?? []) : foods, kind, goal), [foods, kind, goal, onlyAllowed, settings]);
  const compared = list.filter((r) => compare.includes(r.food.item.id));
  const goalDependent = kind === 'protein' || kind === 'carb' || kind === 'fat';
  const maxScore = Math.max(1, ...list.map((r) => r.score));
  const firstPartial = list.findIndex((r) => r.coverage < 0.999);
  const aaRelevant = kind === 'protein' || kind === 'building' || kind === 'cutting';
  return (
    <>
      <div className="rank-kinds tool-row" data-testid="rank-kinds">
        {RANKINGS.map((k) => (
          <button key={k} className={`chip clickable ${k === kind ? 'on' : ''}`} onClick={() => setKind(k)} data-testid={`rank-${k}`} aria-pressed={k === kind}>
            {RANK_ICON[k] && <Icon name={RANK_ICON[k]!} />}{t('rank_' + k)}
          </button>
        ))}
      </div>
      <section className="rank-controls">
        <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
          <span className="small muted">{t('rank_goal')}</span>
          <div className="grow"><Segmented value={goal} onChange={setGoal} options={[{ value: 'cut', label: t('gc_cut') }, { value: 'maintain', label: t('gc_maintain') }, { value: 'build', label: t('gc_build') }]} /></div>
        </div>
        {!goalDependent && <div className="tiny muted">{t('rank_goalNeutral')}</div>}
        <label className="check"><input type="checkbox" checked={onlyAllowed} onChange={(e) => setOnlyAllowed(e.target.checked)} />{t('rank_onlyMyDiet')}</label>
        <div className="method-note"><Icon name="info" /><span>{t('rank_explain_' + kind)} · {t('rank_noUniversal')}</span></div>
      </section>
      {compared.length >= 2 && <CompareTable rows={compared} onClear={() => setCompare([])} />}
      {compared.length === 1 && <div className="compare-hint tiny">{t('rank_compareHint')}</div>}
      <ol className="rank-list" data-testid="rank-list">
        {list.map((r, i) => (
          <li key={r.food.item.id} className={`rank-item ${r.rank <= 3 && r.coverage >= 0.999 ? 'top' : ''}`}>
            {i === firstPartial && <div className="partial-divider"><Icon name="info" /> {t('rank_partialGroup')}</div>}
            <div className="rank-main clickable" onClick={() => setDetail(r)} data-testid="rank-row">
              <span className="rank-no num">{r.rank}</span>
              <div className="grow rank-body" style={{ minWidth: 0 }}>
                <div className="rank-name">{r.food.name}</div>
                <div className="row wrap" style={{ gap: 4, marginTop: 2 }}>
                  {aaRelevant && !r.aas && r.food.protein >= 5 && <span className="chip warn tiny-chip" data-testid="no-aa">{t('rank_noAA')}</span>}
                  {r.coverage < 0.999 && <span className="chip tiny-chip">{t('rank_coverage', { p: Math.round(r.coverage * 100) })}</span>}
                  <span className={`origin-dot ${r.food.item.origin}`}>{t('origin_' + r.food.item.origin)}</span>
                </div>
                <div className="score-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, (r.score / maxScore) * 100)}%` }} /></div>
                <div className="tiny muted num">{n(r.food.kcal)} {t('kcalUnit')} · {t('pShort')} {n(r.food.protein, 1)} · {t('cShort')} {n(r.food.carbs, 1)} · {t('fShort')} {n(r.food.fat, 1)}{r.food.fiber !== undefined ? ` · ${t('fiber')} ${n(r.food.fiber, 1)}` : ''} / 100 {t('g')}</div>
              </div>
              <FoodThumb photoKey={intelPhoto(r.food)} size={r.rank <= 3 && r.coverage >= 0.999 ? 60 : 48} />
              <div className="rank-side">
                <span className="rank-score num" data-testid="rank-score">{kind === 'nutrientDense' ? n(r.score, 0) : n(r.score, 1)}</span>
                <label className={`cmp-toggle ${compare.includes(r.food.item.id) ? 'on' : ''}`} onClick={(e) => e.stopPropagation()} title={t('rank_compare')}>
                  <input type="checkbox" aria-label={t('rank_compare')} checked={compare.includes(r.food.item.id)}
                    onChange={(e) => setCompare((c) => (e.target.checked ? [...c, r.food.item.id].slice(-3) : c.filter((x) => x !== r.food.item.id)))} />
                  <Icon name="compare" />
                </label>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="tiny muted" style={{ margin: '10px 4px' }}>{t('rank_sourceNote')}</div>
      {detail && <FoodDetail r={detail} kind={kind} onClose={() => setDetail(null)} />}
    </>
  );
}

function CompareTable({ rows, onClear }: { rows: Ranked[]; onClear: () => void }) {
  const { t, n } = useApp();
  // the best value per row is highlighted (higher is better unless noted)
  const line = (label: string, get: (r: Ranked) => number | undefined, fmt: (v: number) => string, lowerBetter: boolean | null = false) => {
    const vals = rows.map(get);
    const known = vals.filter((v): v is number => v !== undefined);
    // null = no better/worse direction (e.g. carbohydrate amount depends on the person): nothing is highlighted
    const best = known.length > 1 && lowerBetter !== null ? (lowerBetter ? Math.min(...known) : Math.max(...known)) : undefined;
    return <tr><th>{label}</th>{rows.map((r, i) => <td key={r.food.item.id} className={`num ${best !== undefined && vals[i] === best ? 'best' : ''}`}>{vals[i] === undefined ? '—' : fmt(vals[i]!)}</td>)}</tr>;
  };
  return (
    <section className="compare-card">
      <div className="row between" style={{ marginBottom: 8 }}><h2 className="sec-title" style={{ margin: 0 }}><Icon name="compare" /> {t('rank_compare')}</h2><button className="btn sm ghost" onClick={onClear}>{t('close')}</button></div>
      <div className="compare-heads" style={{ gridTemplateColumns: `repeat(${rows.length}, 1fr)` }}>{rows.map((r) => <div key={r.food.item.id} className="ch"><FoodThumb photoKey={intelPhoto(r.food)} size={44} /><span className="tiny bold">{r.food.name}</span></div>)}</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table compare-table" data-testid="compare-table"><tbody>
          <tr><th />{rows.map((r) => <th key={r.food.item.id} className="tiny">#{r.rank}</th>)}</tr>
          {line(t('kcal'), (r) => r.food.kcal, (v) => n(v), true)}
          {line(t('protein'), (r) => r.food.protein, (v) => n(v, 1))}
          {line(t('carbs'), (r) => r.food.carbs, (v) => n(v, 1), null)}
          {line(t('fat'), (r) => r.food.fat, (v) => n(v, 1), true)}
          {line(t('fiber'), (r) => r.food.fiber, (v) => n(v, 1))}
          {line(t('satFat'), (r) => r.food.satFat, (v) => n(v, 1), true)}
          {line(t('rank_aas'), (r) => { const a = aminoAcidScore(r.food); return a ? a.score * 100 : undefined; }, (v) => n(v, 0) + '%')}
          {line(t('rank_score'), (r) => r.score, (v) => n(v, 1))}
        </tbody></table>
      </div>
      <div className="tiny muted">{t('rank_comparePer100')}</div>
    </section>
  );
}

function FoodDetail({ r, kind, onClose }: { r: Ranked; kind: RankingKind; onClose: () => void }) {
  const { t, n } = useApp();
  const f = r.food;
  const pc = prosCons(f);
  const aas = aminoAcidScore(f);
  const nrf = nrf93(f);
  const pct = Math.max(0, Math.min(100, r.score));
  const C = 2 * Math.PI * 26;
  return (
    <Sheet title={`#${r.rank} · ${f.name}`} onClose={onClose}>
      <div className="stack" data-testid="rank-detail">
        <div className="detail-hero">
          <FoodThumb photoKey={intelPhoto(f)} size={96} className="hero-photo" />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="tiny muted" dir="ltr" style={{ textAlign: 'start' }}>{f.usdaName}</div>
            <div className="row wrap" style={{ gap: 6, margin: '4px 0' }}>
              <span className="src-tag usda">{f.source}</span>
              <span className={`origin-dot ${f.item.origin}`}>{t('origin_' + f.item.origin)}</span>
            </div>
            {r.coverage < 0.999 && <span className="chip tiny-chip">{t('rank_coverage', { p: Math.round(r.coverage * 100) })}</span>}
          </div>
          <div className="score-ring" aria-label={`${t('rank_score')} ${n(r.score, 1)}`}>
            <svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" fill="none" stroke="var(--dial-track)" strokeWidth="5" />
              {kind !== 'nutrientDense' && <circle cx="30" cy="30" r="26" fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 30 30)" />}</svg>
            <b className="num">{n(r.score, 0)}</b>
          </div>
        </div>
        <div className="qp-macros four">
          {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
            <div key={k} className="qp-m" style={{ ['--c' as string]: `var(--${k})` }}><b className="num">{n(f[k], k === 'kcal' ? 0 : 1)}</b><span>{t(k)}{k === 'kcal' ? '' : ` · ${t('g')}`}</span></div>
          ))}
        </div>
        <div className="tiny muted">{t('per100')}</div>

        <h3 className="sec-title">{t('rank_breakdown')}</h3>
        <ul className="breakdown">
          {r.subs.map((s) => (
            <li key={s.key}>
              <div className="row between" style={{ gap: 8 }}><span className="small">{t('sub_' + s.key)}</span><span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{t('rank_weight')} {Math.round(s.weight * 100)}% · <b className="num" style={{ color: 'var(--text)' }}>{s.value === undefined ? t('noData') : n(s.value * 100, 0)}</b></span></div>
              <div className={`bd-bar ${s.value === undefined ? 'nodata' : ''}`}><i style={{ width: `${s.value === undefined ? 0 : Math.max(2, s.value * 100)}%` }} /></div>
            </li>
          ))}
        </ul>

        {aas ? (
          <div data-testid="aa-detail" className="aa-block">
            <h3 className="sec-title">{t('rank_aas')}: <span className="num">{n(aas.score * 100, 0)}%</span> {aas.score < 1 ? <span className="chip warn tiny-chip">{t('rank_limiting')}: {t('aa_' + aas.limiting)}</span> : <span className="chip good tiny-chip">{t('rank_complete')}</span>}</h3>
            <div className="aa-chart">
              {(Object.keys(AA_REFERENCE) as (keyof typeof AA_REFERENCE)[]).map((k) => {
                const v = aas.ratios[k];
                return (
                  <div key={k} className={`aa-row ${k === aas.limiting && aas.score < 1 ? 'limiting' : ''}`}>
                    <span className="aa-name tiny">{t('aa_' + k)}</span>
                    <div className="aa-track"><i style={{ width: `${Math.min(100, (v / 2) * 100)}%` }} /><b className="ref" aria-hidden="true" /></div>
                    <span className="tiny num aa-val">{n(v * 100, 0)}%</span>
                  </div>
                );
              })}
            </div>
            <div className="tiny muted">{t('rank_aasChartNote')}</div>
            <div className="tiny muted">{t('rank_aasNote')}</div>
          </div>
        ) : f.protein >= 5 && <div className="notice small" data-testid="no-aa-detail"><b>{t('rank_aas')}:</b> {t('noData')} — {t('rank_noAAExplain')}</div>}
        {nrf !== undefined && <div className="small">{t('rank_nrf')}: <b className="num">{n(nrf, 0)}</b></div>}
        <div className="pc-grid">
          {!!pc.pros.length && <div className="pc pros"><div className="small bold">{t('rank_pros')}</div><ul className="small">{pc.pros.map((p) => <li key={p.key}>{t(p.key, p.params)}</li>)}</ul></div>}
          {!!pc.cons.length && <div className="pc cons"><div className="small bold">{t('rank_cons')}</div><ul className="small">{pc.cons.map((p) => <li key={p.key}>{t(p.key, { ...p.params, aa: p.params?.aa ? t('aa_' + p.params.aa) : '' })}</li>)}</ul></div>}
        </div>
        {!!pc.uses.length && <div className="row wrap" style={{ gap: 6 }}><span className="small bold">{t('rank_uses')}:</span>{pc.uses.map((u) => <span key={u} className="chip">{t(u)}</span>)}</div>}
      </div>
    </Sheet>
  );
}

/** Article covers: a real food photo where the topic is a food group, a drawn icon otherwise. */
const ARTICLE_COVER: Record<string, { photo?: string; icon?: IconName; tone: string }> = {
  protein: { photo: 'chicken-breast', tone: 'protein' }, carbs: { photo: 'oats', tone: 'carbs' }, fats: { photo: 'avocado', tone: 'fat' },
  fiber: { photo: 'lentils', tone: 'good' }, micros: { photo: 'spinach', tone: 'good' }, quality: { photo: 'broccoli', tone: 'primary' },
  density: { photo: 'watermelon', tone: 'info' }, fatloss: { icon: 'target', tone: 'warn' }, preserve: { photo: 'egg-boiled', tone: 'protein' },
  build: { icon: 'chart', tone: 'fat' }, planning: { icon: 'calendar', tone: 'primary' }, hydration: { icon: 'water', tone: 'info' }, method: { icon: 'shield', tone: 'muted' }
};

function ArticleCover({ id, size }: { id: string; size?: 'lg' }) {
  const c = ARTICLE_COVER[id] ?? { icon: 'book' as IconName, tone: 'primary' };
  return (
    <div className={`art-cover ${size ?? ''}`} style={{ ['--tone' as string]: `var(--${c.tone})` }}>
      {c.photo ? <FoodThumb photoKey={c.photo} size={size === 'lg' ? 400 : 200} className="cover-img" /> : <span className="cover-icon"><Icon name={c.icon ?? 'book'} /></span>}
    </div>
  );
}

function LearnTab() {
  const { t, lang } = useApp();
  const [open, setOpen] = useState<Article | null>(null);
  if (!ARTICLES.length) return <EmptyState icon="—" text="—" />;
  return (
    <>
      <div className="learn-grid" data-testid="learn-list">
        {ARTICLES.map((a) => {
          const nSources = new Set(a.sections.flatMap((s) => s.sources ?? [])).size;
          return (
            <button key={a.id} className="learn-card" onClick={() => setOpen(a)} data-testid={`learn-${a.id}`}>
              <ArticleCover id={a.id} />
              <div className="lc-body">
                <div className="lc-title">{a.title[lang]}</div>
                <div className="tiny muted lc-sum">{a.summary[lang]}</div>
                <div className="tiny lc-meta"><Icon name="book" /> {t('learn_sources', { n: nSources })}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="tiny muted" style={{ marginTop: 10 }}>{t('learn_disclaimer')}</div>
      {open && (
        <Sheet title={open.title[lang]} onClose={() => setOpen(null)}>
          <div className="stack article" data-testid="article">
            <ArticleCover id={open.id} size="lg" />
            <p className="lede">{open.summary[lang]}</p>
            {open.sections.map((s, i) => (
              <section key={i} className={`article-sec ${s.level}`}>
                <span className={`level-tag ${s.level}`}>{t('level_' + s.level)}</span>
                <p>{s[lang]}</p>
                {s.sources?.map((id) => <a key={id} className="cite" dir="ltr" href={SOURCES[id].url} target="_blank" rel="noreferrer">↗ {SOURCES[id].cite}</a>)}
              </section>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
