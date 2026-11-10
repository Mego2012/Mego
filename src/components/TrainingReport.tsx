import { useApp } from '../app/AppContext';
import { useTraining } from '../app/hooks';
import { today } from '../lib/dates';
import { EXERCISES, findExercise, MUSCLES } from '../lib/exercises';
import { exerciseHistory, exerciseTrend, prsInRange, setsPerMuscle, trainingStats } from '../lib/trainingCoach';
import { Card, Delta } from './ui';

/** Weekly/monthly report: workout consistency, sets, volume, sets per muscle, PRs and strength trends. */
export function TrainingReport({ dates, prevDates }: { dates: string[]; prevDates: string[] }) {
  const { t, n, lang } = useApp();
  const tr = useTraining();
  if (!tr) return null;
  const program = tr.programs.find((p) => p.id === tr.activeId) ?? tr.programs[0];
  const list = [...EXERCISES, ...tr.custom];
  const past = dates.filter((d) => d <= today());
  const cur = trainingStats(tr.workouts, past, program, list);
  const prev = trainingStats(tr.workouts, prevDates, program, list);
  const sets = setsPerMuscle(tr.workouts, past, list);
  const ids = [...new Set(tr.workouts.flatMap((w) => w.exercises.map((x) => x.exerciseId)))];
  const prs = prsInRange(ids, tr.workouts, dates[0], dates[dates.length - 1], list);
  const trends = ids.map((id) => exerciseTrend(exerciseHistory(id, tr.workouts.filter((w) => w.date <= dates[dates.length - 1]), list)).trend);
  const name = (id: string) => { const e = findExercise(id, list); return e ? (lang === 'ar' ? e.nameAr : e.nameEn) : id; };
  return (
    <Card title={t('nav_workouts')}>
      <div className="grid3" data-testid="report-training">
        <div className="stat"><div className="k">{t('ov_workouts')}</div><div className="v num" data-testid="rt-sessions">{cur.sessions} / {cur.planned}</div><div className="tiny">{t('vsPrevious')}: <Delta value={cur.sessions - prev.sessions} digits={0} invert /></div></div>
        <div className="stat"><div className="k">{t('rt_consistency')}</div><div className="v num">{cur.consistencyPct === null ? '—' : `${cur.consistencyPct}%`}</div></div>
        <div className="stat"><div className="k">{t('rt_sets')}</div><div className="v num">{n(cur.sets)}</div><div className="tiny">{t('vsPrevious')}: <Delta value={cur.sets - prev.sets} digits={0} invert /></div></div>
        <div className="stat"><div className="k">{t('pg_volume')}</div><div className="v num">{n(cur.volume)}</div><div className="tiny muted">{t('kg')}</div></div>
        <div className="stat"><div className="k">{t('rt_prs')}</div><div className="v num">{prs.length}</div></div>
        <div className="stat"><div className="k">{t('rt_trends')}</div><div className="v small num">↑{trends.filter((x) => x === 'improving').length} · ↓{trends.filter((x) => x === 'declining').length}</div></div>
      </div>
      {cur.sessions > 0 && <div className="tiny" style={{ marginTop: 6 }}>{MUSCLES.filter((m) => sets[m] > 0).map((m) => `${t('mus_' + m)} ${n(sets[m], 1)}`).join(' · ')}</div>}
      {prs.length > 0 && <ul className="small" style={{ paddingInlineStart: 20, margin: '6px 0 0' }}>{prs.slice(0, 6).map((p) => <li key={p.exerciseId + p.date}>{name(p.exerciseId)} — {n(p.e1rm, 1)} {t('kg')} e1RM · {p.date}</li>)}</ul>}
      {!cur.sessions && <div className="tiny muted">{t('wk_none')}</div>}
    </Card>
  );
}
