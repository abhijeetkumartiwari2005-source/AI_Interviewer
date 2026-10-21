// Live dashboard beside the interview (FLOW §13): the last answer's score and its five
// dimensions, plus the running skill estimate. Every value is printed next to its bar.
import { COMPETENCY_SHORT, DIM_LABEL } from '../labels';
import type { Competency, Dims, Evaluation, SkillEstimate } from '../types';

interface Props {
  evaluation: Evaluation | null;
  skillEstimate: SkillEstimate;
}

export function LiveScores({ evaluation, skillEstimate }: Props) {
  const skills = (Object.keys(COMPETENCY_SHORT) as Competency[])
    .filter((c) => skillEstimate[c] !== undefined)
    .map((c) => ({ label: COMPETENCY_SHORT[c], value: skillEstimate[c]! }));

  return (
    <details className="live" open>
      <summary>Live scores</summary>

      {!evaluation ? (
        <p className="muted small">Scores appear here after your first answer.</p>
      ) : !evaluation.evaluated ? (
        <p className="small">
          <span className="chip chip--warn">Evaluation unavailable</span> This answer wasn’t scored and won’t count against you.
        </p>
      ) : (
        <>
          <div className="live__last" aria-live="polite">
            <span className="live__figure">{evaluation.score?.toFixed(1)}</span>
            <span className="muted small">/ 10 last answer</span>
          </div>
          {evaluation.feedback && <p className="live__feedback small">{evaluation.feedback}</p>}
          {evaluation.dims && <MiniBars label="Last answer by dimension" rows={dimRows(evaluation.dims)} />}
        </>
      )}

      {skills.length > 0 && (
        <>
          <h3 className="live__heading">Skill estimate so far</h3>
          <MiniBars label="Skill estimate so far" rows={skills} />
        </>
      )}
    </details>
  );
}

function MiniBars({ label, rows }: { label: string; rows: { label: string; value: number }[] }) {
  return (
    <ul className="minibars" aria-label={`${label}, out of 10`}>
      {rows.map((r) => (
        <li key={r.label}>
          <span className="minibars__label">{r.label}</span>
          <span className="minibars__track" aria-hidden="true">
            <span className="minibars__fill" style={{ width: `${Math.max(r.value, 0.2) * 10}%` }} />
          </span>
          <span className="minibars__value">{r.value.toFixed(1)}</span>
        </li>
      ))}
    </ul>
  );
}

const dimRows = (dims: Dims) => (Object.keys(DIM_LABEL) as (keyof Dims)[]).map((k) => ({ label: DIM_LABEL[k], value: dims[k] }));
