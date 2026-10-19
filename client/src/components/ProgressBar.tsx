import type { Progress, Stage } from '../types';

const STAGE_LABEL: Record<Stage, string> = {
  intro: 'Introduction',
  project: 'Project deep dive',
  technical: 'Technical',
  problem_solving: 'Problem-solving',
  decision_making: 'Decision-making',
};

export function ProgressBar({ progress }: { progress: Progress }) {
  const pct = Math.round(((progress.main - 1) / progress.mainTotal) * 100);
  return (
    <div className="progress">
      <div className="progress__meta">
        <span>
          Question <strong>{progress.main}</strong> of {progress.mainTotal}
        </span>
        {progress.stage && <span className="chip">{STAGE_LABEL[progress.stage]}</span>}
        <span className="muted">
          {progress.followUps} follow-up{progress.followUps === 1 ? '' : 's'}
        </span>
      </div>
      <div className="progress__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
