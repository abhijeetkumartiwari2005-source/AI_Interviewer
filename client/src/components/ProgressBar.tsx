import { STAGE_LABEL } from '../labels';
import type { Progress } from '../types';

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
