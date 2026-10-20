// End-of-interview report (FLOW §9): scores computed in code, one LLM call for the narrative,
// every quote checked against what the candidate said, cached on the session once complete.
import { isValidObjectId } from 'mongoose';
import { rubrics } from '../catalog.js';
import { config } from '../config.js';
import { InterviewModel, toState } from '../db.js';
import { AppError } from '../middleware/error.js';
import {
  COMPETENCIES,
  ReportNarrativeSchema,
  type Competency,
  type Evidence,
  type InterviewState,
  type Report,
  type ReportNarrative,
} from '../schemas.js';
import { findEvidence } from './evidence.js';
import { generateJSON, LLMUnavailableError } from './llm.js';
import { buildReportPrompt, REPORT_SYSTEM_PROMPT } from './promptBuilder.js';
import { COMPETENCY_WEIGHTS, competencyScores, MIN_SCORED_MAINS, overallScore, verdict } from './scoring.js';

// Concurrent requests for the same report share one LLM call.
const inflight = new Map<string, Promise<Report>>();

export async function getReport(id: string): Promise<Report> {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Interview not found');
  const doc = await InterviewModel.findById(id).lean();
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Interview not found');
  const state = toState(doc);
  if (state.status !== 'completed') throw new AppError(409, 'INTERVIEW_ACTIVE', 'End the interview before requesting its report');
  if (state.report?.narrativeStatus === 'ok') return state.report;

  let pending = inflight.get(id);
  if (!pending) {
    pending = buildReport(state).finally(() => inflight.delete(id));
    inflight.set(id, pending);
  }
  return pending;
}

async function buildReport(state: InterviewState): Promise<Report> {
  const scores = competencyScores(state.turns);
  const overall = overallScore(scores);
  const result = verdict(state.turns, scores, overall);
  const competencies = COMPETENCIES.map((id) => ({
    id,
    label: rubrics.competencies[id]?.label ?? id,
    ...scores[id],
    weight: COMPETENCY_WEIGHTS[id],
    descriptor: descriptorFor(id, scores[id].score),
  }));

  let narrative: Report['narrative'] = null;
  let narrativeStatus: Report['narrativeStatus'] = 'no_answers';
  if (state.turns.some((t) => t.evaluated)) {
    try {
      const { data } = await generateJSON({
        system: REPORT_SYSTEM_PROMPT,
        prompt: buildReportPrompt(state, { overall, verdict: result, competencies }),
        schema: ReportNarrativeSchema,
        label: 'report',
        timeoutMs: config.LLM_REPORT_TIMEOUT_MS,
      });
      narrative = verifyNarrative(data, state.turns.map((t) => t.transcript));
      narrativeStatus = 'ok';
    } catch (err) {
      if (!(err instanceof LLMUnavailableError)) throw err;
      console.error(`[report] narrative unavailable: ${err.message}`);
      narrativeStatus = 'unavailable';
    }
  }

  const report: Report = {
    interviewId: state._id,
    generatedAt: new Date().toISOString(),
    candidate: { name: state.profile.name, branch: state.profile.branch, targetRole: state.profile.targetRole },
    overall,
    verdict: result,
    coverage: {
      answers: state.turns.length,
      scoredMain: state.turns.filter((t) => t.evaluated && t.question.type === 'main').length,
      minScoredMain: MIN_SCORED_MAINS,
      competenciesWithEvidence: competencies.filter((c) => c.score !== null).length,
    },
    competencies,
    answers: state.turns.map((t) => ({
      question: { text: t.question.text, persona: t.question.persona, stage: t.question.stage, type: t.question.type },
      transcript: t.transcript,
      evaluated: t.evaluated,
      score: t.score ?? null,
      dims: t.dims ?? null,
      feedback: t.feedback ?? null,
    })),
    narrativeStatus,
    narrative,
  };

  // Only a complete report is cached, so a failed narrative is retried on the next request.
  if (narrativeStatus === 'ok') await InterviewModel.updateOne({ _id: state._id }, { $set: { report } });
  return report;
}

/** The rubric anchor (2 / 5 / 8) nearest the score, so the UI can say what the number means. */
function descriptorFor(id: Competency, score: number | null): string | null {
  const rubric = rubrics.competencies[id];
  if (!rubric || score === null) return null;
  return rubric[score < 3.5 ? '2' : score < 6.5 ? '5' : '8'] ?? null;
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;
const stripUrls = (s: string) => s.replace(URL_PATTERN, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();

function verifyNarrative(n: ReportNarrative, transcripts: string[]): NonNullable<Report['narrative']> {
  const cite = (quote: string): Evidence | null => {
    const m = findEvidence(quote, transcripts);
    return m && { quote: m.quote, turnIndex: m.turnIndex };
  };

  // A strength must be backed by the candidate's own words; unbacked ones are dropped.
  const strengths = n.strengths.flatMap((s) => {
    const evidence = cite(s.evidenceQuote);
    return evidence ? [{ point: s.point, evidence }] : [];
  });
  // Improvements are often about what wasn't said, so they stay; only a quote that doesn't match is dropped.
  const improvements = n.improvements.map((s) => ({ point: s.point, evidence: cite(s.evidenceQuote) }));

  const dropped = n.strengths.length - strengths.length;
  if (dropped) console.warn(`[report] dropped ${dropped} strength(s) whose quote didn't match the transcript`);

  return {
    summary: stripUrls(n.summary),
    strengths,
    improvements,
    knowledgeGaps: n.knowledgeGaps.map(stripUrls).filter(Boolean),
    practicePlan: n.practicePlan
      .map((p) => ({ activity: stripUrls(p.activity), why: stripUrls(p.why), resource: stripUrls(p.resource) }))
      .filter((p) => p.activity),
  };
}
