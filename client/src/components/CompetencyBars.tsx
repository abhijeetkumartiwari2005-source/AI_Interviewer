// Competency scores as horizontal bars (0–10), heaviest-weighted first. One series, so one hue and
// no legend; rubric anchors (2 weak / 5 adequate / 8 strong) are hairline ticks on every track.
// Each row is focusable and shows weight + evidence count on hover/focus; the score and rubric
// descriptor are always visible, so the tooltip never hides anything essential.
import type { CompetencyResult } from '../types';

const ANCHORS = [
  { at: 2, label: 'weak' },
  { at: 5, label: 'adequate' },
  { at: 8, label: 'strong' },
];

export function CompetencyBars({ competencies }: { competencies: CompetencyResult[] }) {
  const rows = [...competencies].sort((a, b) => b.weight - a.weight);

  return (
    <div className="bars">
      <ul className="bars__list" aria-label="Competency scores out of 10">
        {rows.map((c) => (
          <li key={c.id} className={`bars__row${c.score === null ? ' is-empty' : ''}`} tabIndex={0} aria-describedby={`tip-${c.id}`}>
            <span className="bars__label">{c.label}</span>
            <span className="bars__track" aria-hidden="true">
              {ANCHORS.map((a) => (
                <span key={a.at} className="bars__tick" style={{ left: `${a.at * 10}%` }} />
              ))}
              {c.score !== null && <span className="bars__fill" style={{ width: `${Math.max(c.score, 0.2) * 10}%` }} />}
            </span>
            <span className="bars__value">{c.score === null ? '—' : c.score.toFixed(1)}</span>
            <span className="bars__desc">
              {c.score === null ? 'No evidence in this interview' : c.descriptor}
              {c.turns === 1 && ' · based on 1 answer only'}
            </span>
            <span role="tooltip" id={`tip-${c.id}`} className="bars__tip">
              <strong>{c.score === null ? 'No evidence' : `${c.score.toFixed(1)} / 10`}</strong>
              <span>
                {Math.round(c.weight * 100)}% of overall · from {c.turns} answer{c.turns === 1 ? '' : 's'}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="bars__axis" aria-hidden="true">
        <span />
        <span className="bars__axis-track">
          {ANCHORS.map((a) => (
            <span key={a.at} style={{ left: `${a.at * 10}%` }}>
              {a.at} {a.label}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
