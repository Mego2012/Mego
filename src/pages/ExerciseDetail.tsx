import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useTraining } from '../app/hooks';
import { ExerciseFigure } from '../components/ExerciseFigure';
import { Icon } from '../components/icons';
import { MuscleChart } from '../components/MuscleChart';
import { Card } from '../components/ui';
import { fitnessOf } from '../lib/energy';
import { alternativesFor, EXERCISES, findExercise, type Equipment, type Exercise } from '../lib/exercises';
import { VISUALS } from '../lib/exerciseVisuals';
import { kvSet } from '../lib/repo';
import { TECHNIQUE } from '../lib/technique';
import { exerciseHistory, personalRecords } from '../lib/trainingCoach';

/** Dedicated exercise page: demonstration, start/finish, technique, mistakes, safety, muscles, prescription, my history. */
export default function ExerciseDetailPage() {
  const { id = '' } = useParams();
  const { t, n, lang, settings } = useApp();
  const nav = useNavigate();
  const tr = useTraining();
  if (!tr) return null;
  const list: Exercise[] = [...EXERCISES, ...tr.custom];
  const e = findExercise(id, list);
  if (!e) return <div className="empty" data-testid="exercise-missing">{t('exd_notFound')}</div>;
  const idx = list.findIndex((x) => x.id === e.id);
  const prev = list[(idx - 1 + list.length) % list.length], next = list[(idx + 1) % list.length];
  const v = VISUALS[e.id];
  const tq = TECHNIQUE[e.id];
  const ar = lang === 'ar';
  const name = (x: Exercise) => (ar ? x.nameAr || x.nameEn : x.nameEn || x.nameAr);
  const program = tr.programs.find((p) => p.id === tr.activeId) ?? tr.programs[0];
  const planned = program?.days.flatMap((d) => d.exercises).find((x) => x.exerciseId === e.id);
  const h = exerciseHistory(e.id, tr.workouts, list);
  const pr = personalRecords(h);
  const fav = tr.preferred.includes(e.id);
  const alts = alternativesFor(e.id, list, fitnessOf(settings).equipment as Equipment[] | undefined);
  const List = ({ items, testId, ordered }: { items: string[]; testId: string; ordered?: boolean }) => {
    const Tag = ordered ? 'ol' : 'ul';
    return <Tag className="small tech-list" data-testid={testId}>{items.map((x, i) => <li key={i}>{x}</li>)}</Tag>;
  };
  return (
    <div data-testid="exercise-page" data-id={e.id}>
      <div className="datenav">
        <button className="icon-btn flip" onClick={() => nav('/exercise/' + prev.id, { replace: true })} aria-label={t('previous')} data-testid="exd-prev"><Icon name="back" /></button>
        <div className="label" style={{ textAlign: 'center' }}>
          <div className="bold" data-testid="exd-name">{name(e)}</div>
          
        </div>
        <button className="icon-btn flip" onClick={() => nav('/exercise/' + next.id, { replace: true })} aria-label={t('next')} data-testid="exd-next"><Icon name="fwd" /></button>
      </div>

      <Card title={t('exd_demo')}>
        {v ? (
          <>
            <div className="ex-demo" data-testid="exd-demo"><ExerciseFigure visual={v} primary={e.primary} secondary={e.secondary} animate size={260} label={t('exd_demo') + ' — ' + name(e)} /></div>
            <div className="ex-frames">
              <figure><ExerciseFigure visual={v} primary={e.primary} secondary={e.secondary} at={0} size={150} label={t('exd_start')} /><figcaption className="tiny">{t('exd_start')}</figcaption></figure>
              <figure><ExerciseFigure visual={v} primary={e.primary} secondary={e.secondary} at={1} size={150} label={t('exd_finish')} /><figcaption className="tiny">{t('exd_finish')}</figcaption></figure>
            </div>
            {(ar ? v.noteAr : v.noteEn) && <div className="tiny muted">{ar ? v.noteAr : v.noteEn}</div>}
            <div className="tiny muted" style={{ marginTop: 4 }}>{t('exd_figureNote')}</div>
          </>
        ) : <div className="banner info small" data-testid="exd-novisual">{t('exd_noVisual')}</div>}
      </Card>

      <Card title={t('exd_muscles')}>
        <MuscleChart primary={e.primary} secondary={e.secondary} labels={{ front: t('exd_front'), back: t('exd_back') }} />
        <div className="row wrap" style={{ gap: 4, justifyContent: 'center' }}>
          <span className="chip good">{t('exd_primary')}: {t('mus_' + e.primary)}</span>
          {e.secondary.map((m) => <span key={m} className="chip">{t('mus_' + m)}</span>)}
        </div>
        <div className="row wrap" style={{ gap: 4, marginTop: 6, justifyContent: 'center' }}>
          <span className="chip">{t('cat_' + e.category)}</span>{e.equipment.map((q) => <span key={q} className="chip">{t('eq_' + q)}</span>)}
        </div>
      </Card>

      <Card title={t('exd_rx')}>
        <div className="grid2" data-testid="exd-rx">
          <div className="stat"><div className="k">{t('exd_setsReps')}</div><div className="v num">{planned ? `${planned.sets} × ${planned.repMin}–${planned.repMax}` : `${e.sets} × ${e.reps[0]}–${e.reps[1]}`}</div><div className="tiny muted">{planned ? t('exd_fromProgram') : t('exd_suggested')}</div></div>
          <div className="stat"><div className="k">{t('exd_rest')}</div><div className="v num">{planned?.restSec ?? e.restSec} s</div>{planned && <div className="tiny muted">RIR {planned.targetRir}</div>}</div>
        </div>
      </Card>

      {tq ? (
        <>
          <Card title={t('exd_setup')}><List items={ar ? tq.setupAr : tq.setupEn} testId="exd-setup" /></Card>
          <Card title={t('exd_steps')}>
            <List items={ar ? tq.stepsAr : tq.stepsEn} testId="exd-steps" ordered />
            <ul className="adherence small" style={{ marginTop: 8 }}>
              <li><span>{t('exd_breathing')}</span><b className="small" style={{ fontWeight: 400 }}>{ar ? tq.breathingAr : tq.breathingEn}</b></li>
              <li><span>{t('exd_range')}</span><b className="small" style={{ fontWeight: 400 }}>{ar ? tq.rangeAr : tq.rangeEn}</b></li>
              <li><span>{t('exd_tempo')}</span><b className="small" style={{ fontWeight: 400 }}>{ar ? tq.tempoAr : tq.tempoEn}</b></li>
            </ul>
          </Card>
          <Card title={t('exd_mistakes')}><List items={ar ? tq.mistakesAr : tq.mistakesEn} testId="exd-mistakes" /></Card>
          <Card title={t('exd_safety')}>
            <List items={ar ? tq.safetyAr : tq.safetyEn} testId="exd-safety" />
            <div className="tiny muted">{t('exd_disclaimer')}</div>
          </Card>
        </>
      ) : (
        <Card title={t('exd_steps')}><p className="small">{ar ? e.howAr || e.howEn : e.howEn || e.howAr || '—'}</p><div className="tiny muted">{t('exd_customNote')}</div></Card>
      )}

      <Card title={t('exd_history')}>
        {h.length ? (
          <>
            {pr && <div className="tiny" style={{ marginBottom: 6 }} data-testid="exd-pr">{t('pr_e1rm')}: <b className="num">{n(pr.bestE1rm, 1)} {t('kg')}</b> · {t('pr_maxW')}: <b className="num">{n(pr.maxWeight, 1)} {t('kg')}</b></div>}
            <ul className="list" data-testid="exd-history">
              {[...h].reverse().slice(0, 6).map((p) => <li key={p.sessionId}><span className="grow small num">{p.date}</span><span className="tiny num" dir="ltr">{p.sets.map((s) => `${n(s.weightKg ?? 0, 1)}×${s.reps}${s.rir != null ? ` @${s.rir}` : ''}`).join(' · ')}</span></li>)}
            </ul>
          </>
        ) : <div className="small muted" data-testid="exd-history-empty">{t('exd_noHistory')}</div>}
      </Card>

      <Card title={t('lib_alternatives')}>
        <ul className="list" data-testid="exd-alternatives">{alts.map((a) => <li key={a.id}><Link className="grow small" to={'/exercise/' + a.id} replace>{name(a)}</Link><span className="tiny muted">{a.equipment.map((q) => t('eq_' + q)).join(ar ? '، ' : ', ')}</span></li>)}
          {!alts.length && <li className="empty">—</li>}</ul>
        <button className={`chip clickable ${fav ? 'on' : ''}`} style={{ marginTop: 8 }} onClick={() => kvSet('preferredExercises', fav ? tr.preferred.filter((x) => x !== e.id) : [...tr.preferred, e.id])} data-testid="ex-fav"><Icon name="star" filled={fav} /> {t('lib_preferred')}</button>
      </Card>
      <Link className="btn block ghost" to="/workouts?tab=library">{t('exd_backToLibrary')}</Link>
    </div>
  );
}
