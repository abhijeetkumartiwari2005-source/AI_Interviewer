// Readiness verdict: status colour on the icon only, always paired with a text label.
import type { Verdict } from '../types';

const VERDICT: Record<Verdict, { label: string; icon: 'check' | 'half' | 'alert' | 'question' }> = {
  ready: { label: 'Ready', icon: 'check' },
  almost_ready: { label: 'Almost ready', icon: 'half' },
  needs_practice: { label: 'Needs practice', icon: 'alert' },
  insufficient_evidence: { label: 'Not enough evidence', icon: 'question' },
};

const ICON_PATH = {
  check: 'M7 12.5l3.2 3.2L17 9',
  half: 'M12 4a8 8 0 0 1 0 16z',
  alert: 'M12 7.5v5.5M12 16.4v.1',
  question: 'M9.6 9.3a2.5 2.5 0 1 1 3.3 2.4c-.6.3-.9.8-.9 1.4v.4M12 16.4v.1',
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict];
  return (
    <span className={`verdict verdict--${verdict}`}>
      <svg className="verdict__icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d={ICON_PATH[v.icon]} className={v.icon === 'half' ? 'is-filled' : undefined} />
      </svg>
      {v.label}
    </span>
  );
}
