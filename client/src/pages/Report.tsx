// End-of-interview report: readiness and coverage first (what a recruiter reads), then competency
// scores, the written feedback with quotes from the candidate's own answers, and every answer.
import { CompetencyBars } from '../components/CompetencyBars';
import { VerdictBadge } from '../components/VerdictBadge';
import type { InterviewUiState } from '../hooks/useInterview';
import { useReport } from '../hooks/useReport';
import { DIM_LABEL, STAGE_LABEL } from '../labels';
import type { Dims, Evidence, Persona, Report as ReportData } from '../types';

export function Report({ state, onRestart }: { state: InterviewUiState; onRestart: () => void }) {
  const { report, loading, error, reload } = useReport(state.interviewId);

  return (
    <main className="page page--report">
      <header className="hero">
        <p className="eyebrow">Interview report</p>
        <h1>{report ? `${report.candidate.name} · ${report.candidate.targetRole}` : 'Thanks for interviewing with the panel.'}</h1>
        {report ? (
          <p className="lede">
            {report.candidate.branch} · {new Date(report.generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        ) : (
          state.closingLine && <p className="lede">“{state.closingLine}”</p>
        )}
      </header>

      {error && (
        <div className="banner banner--error" role="alert">
          <span>Couldn’t load the report: {error}</span>
          <button type="button" className="btn" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      {!report && loading && (
        <section className="card report__loading" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <div>
            <strong>Preparing your report…</strong>
            <p className="muted small">The panel is writing up your feedback. This can take up to half a minute.</p>
          </div>
        </section>
      )}

      {report && (
        <>
          <Summary report={report} />

          <section className="card report__section">
            <h2>Competencies</h2>
            <CompetencyBars competencies={report.competencies} />
            <p className="muted small">
              Overall score weights: {weightsLine(report)}. Vocal delivery is judged on pace, pauses and filler words only, never
              accent or pronunciation.
            </p>
          </section>

          <Feedback report={report} panel={state.panel} loading={loading} onRetry={reload} />
          <Answers report={report} panel={state.panel} />
        </>
      )}

      <div className="form__footer report__actions">
        {report && (
          <button type="button" className="btn" onClick={printReport}>
            Print / save as PDF
          </button>
        )}
        <button type="button" className="btn btn--primary btn--lg" onClick={onRestart}>
          Start a new interview
        </button>
      </div>
    </main>
  );
}

function Summary({ report }: { report: ReportData }) {
  const { coverage: c } = report;
  return (
    <section className="card report__summary">
      <div className="report__score">
        <span className="report__figure">{report.overall ?? '—'}</span>
        <span className="muted">/ 100 overall</span>
      </div>
      <div className="report__verdict">
        <VerdictBadge verdict={report.verdict} />
        <p className="report__coverage">
          <span>
            <strong>
              {c.mainAttempted} of {c.mainPlanned}
            </strong>{' '}
            main questions attempted · {c.followUps} follow-up{c.followUps === 1 ? '' : 's'}
          </span>
          {c.endedEarly && <span className="chip chip--warn">Ended early by candidate</span>}
        </p>
        {report.verdict === 'insufficient_evidence' && (
          <p className="muted small">
            A readiness verdict needs at least {c.minScoredMain} scored main answers, including the project and technical
            questions. Scores below are based only on what was answered.
          </p>
        )}
        {report.narrative && <p className="report__narrative">{report.narrative.summary}</p>}
      </div>
    </section>
  );
}

function Feedback({ report, panel, loading, onRetry }: { report: ReportData; panel: Persona[]; loading: boolean; onRetry: () => void }) {
  if (report.narrativeStatus === 'no_answers') {
    return <p className="muted">No answers were evaluated, so there is no written feedback for this interview.</p>;
  }
  if (!report.narrative) {
    return (
      <div className="banner banner--warn" role="status">
        <span>The written feedback couldn’t be generated right now. The scores above are complete.</span>
        <button type="button" className="btn" onClick={onRetry} disabled={loading}>
          {loading ? 'Retrying…' : 'Try again'}
        </button>
      </div>
    );
  }

  const n = report.narrative;
  const cite = (e: Evidence) => <EvidenceQuote evidence={e} report={report} panel={panel} />;
  return (
    <>
      <div className="report__columns">
        <section className="card report__section">
          <h2>Strengths</h2>
          {n.strengths.length ? (
            <ul className="points">
              {n.strengths.map((s) => (
                <li key={s.point}>
                  <p>{s.point}</p>
                  {cite(s.evidence)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No strengths could be backed by a quote from your answers.</p>
          )}
        </section>
        <section className="card report__section">
          <h2>To improve</h2>
          <ul className="points">
            {n.improvements.map((s) => (
              <li key={s.point}>
                <p>{s.point}</p>
                {s.evidence && cite(s.evidence)}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {n.knowledgeGaps.length > 0 && (
        <section className="card report__section">
          <h2>Knowledge gaps</h2>
          <ul className="gaps">
            {n.knowledgeGaps.map((g) => (
              <li key={g} className="chip">
                {g}
              </li>
            ))}
          </ul>
        </section>
      )}

      {n.practicePlan.length > 0 && (
        <section className="card report__section">
          <h2>Practice plan</h2>
          <ol className="plan">
            {n.practicePlan.map((p) => (
              <li key={p.activity}>
                <strong>{p.activity}</strong>
                <p className="muted">{p.why}</p>
                {p.resource && <p className="small">Resource: {p.resource}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function EvidenceQuote({ evidence, report, panel }: { evidence: Evidence; report: ReportData; panel: Persona[] }) {
  const answer = report.answers[evidence.turnIndex];
  return (
    <blockquote className="evidence">
      “{evidence.quote}”
      <cite>
        Your answer to Q{evidence.turnIndex + 1}
        {answer && ` · ${personaName(panel, answer.question.persona)}, ${STAGE_LABEL[answer.question.stage]}`}
      </cite>
    </blockquote>
  );
}

function Answers({ report, panel }: { report: ReportData; panel: Persona[] }) {
  if (!report.answers.length) return null;
  return (
    <section className="card report__section">
      <h2>Answer by answer</h2>
      <div className="answers">
        {report.answers.map((a, i) => (
          <details key={i} className="answer">
            <summary>
              <span className="answer__meta">
                Q{i + 1} · {personaName(panel, a.question.persona)} · {STAGE_LABEL[a.question.stage]}
                {a.question.type === 'followup' && <span className="chip">Follow-up</span>}
              </span>
              <span className="answer__score">{a.evaluated && a.score !== null ? `${a.score.toFixed(1)} / 10` : 'Not scored'}</span>
            </summary>
            <p className="answer__q">{a.question.text}</p>
            <p className="answer__a">{a.transcript || <em className="muted">(no answer)</em>}</p>
            {a.feedback && <p className="small">{a.feedback}</p>}
            {a.dims && <p className="muted small">{dimsLine(a.dims)}</p>}
            {!a.evaluated && <p className="muted small">This answer couldn’t be evaluated, so it isn’t counted in the scores.</p>}
          </details>
        ))}
      </div>
    </section>
  );
}

/** Expands every answer first, since collapsed <details> don't print in most browsers. */
function printReport() {
  document.querySelectorAll('details').forEach((d) => (d.open = true));
  window.print();
}

const personaName = (panel: Persona[], id: string) => panel.find((p) => p.id === id)?.name ?? 'Panel';

const dimsLine = (dims: Dims) =>
  (Object.keys(DIM_LABEL) as (keyof Dims)[]).map((k) => `${DIM_LABEL[k]} ${dims[k]}`).join(' · ');

const weightsLine = (report: ReportData) =>
  [...report.competencies]
    .sort((a, b) => b.weight - a.weight)
    .map((c) => `${c.label.toLowerCase()} ${Math.round(c.weight * 100)}%`)
    .join(', ');
