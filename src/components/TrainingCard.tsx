import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { useTraining } from '../app/hooks';
import { today } from '../lib/dates';
import { trainingStats } from '../lib/trainingCoach';
import { dayFor, dayLabel, isCompleted, weekDatesFrom } from '../lib/workouts';
import { Icon } from './icons';
import { Card } from './ui';

/** Home: today's workout from the active program and this week's completed sessions. */
export function TrainingCard() {
  const { t } = useApp();
  const tr = useTraining();
  if (!tr) return null;
  const program = tr.programs.find((p) => p.id === tr.activeId) ?? tr.programs[0];
  const date = today();
  const day = program ? dayFor(program, date) : undefined;
  const done = tr.workouts.some((w) => w.date === date && isCompleted(w));
  const st = program ? trainingStats(tr.workouts, weekDatesFrom(date), program) : null;
  return (
    <Card title={<><Icon name="flame" />{t('wk_today')}</>} actions={<Link className="btn sm ghost" to="/workouts?tab=overview">{t('wt_overview')}</Link>}>
      <div className="row between" data-testid="training-card">
        <div style={{ minWidth: 0 }}>
          <div className="bold">{!program ? t('nav_workouts') : day ? dayLabel(day, t) : '—'} {done && <span className="chip good">✓</span>}</div>
          {st && <div className="tiny muted">{t('ov_workouts')}: {st.sessions} / {st.planned}</div>}
        </div>
        <Link className="btn sm primary" to="/workouts?tab=today" data-testid="home-start-workout">{done ? t('wt_today') : t('wk_start')}</Link>
      </div>
    </Card>
  );
}
