// Placeholder until the report module lands (Day 4): shows the closing line, per-answer
// scores and the running skill estimate so the full voice loop can be checked end to end.
import type { InterviewUiState } from '../hooks/useInterview';

const COMPETENCY_LABEL: Record<string, string> = {
  clarity: 'Clarity of communication',
  problemSolving: 'Problem-solving',
  decisionMaking: 'Decision-making',
  technicalKnowledge: 'Technical knowledge',
  projectOwnership: 'Project ownership',
  explanation: 'Explaining concepts',
};

export function Report({ state, onRestart }: { state: InterviewUiState; onRestart: () => void }) {
  const skills = Object.entries(state.skillEstimate);
  return (
    <main className="page page--report">
      <header className="hero">
        <p className="eyebrow">Interview complete</p>
        <h1>Thanks for interviewing with the panel.</h1>
        {state.closingLine && <p className="lede">“{state.closingLine}”</p>}
      </header>

      {skills.length > 0 && (
        <section className="card">
          <h2>Skill estimate so far</h2>
          <ul className="skills">
            {skills.map(([key, value]) => (
              <li key={key}>
                <span>{COMPETENCY_LABEL[key] ?? key}</span>
                <span className="skills__bar">
                  <span style={{ width: `${(value ?? 0) * 10}%` }} />
                </span>
                <strong>{value}</strong>
              </li>
            ))}
          </ul>
          <p className="muted small">The full report, with evidence and a practice plan, is coming next.</p>
        </section>
      )}

      <div className="form__footer">
        <button type="button" className="btn btn--primary btn--lg" onClick={onRestart}>
          Start a new interview
        </button>
      </div>
    </main>
  );
}
