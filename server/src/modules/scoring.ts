// Pure scoring helpers: per-turn score, live skill estimate, and the report roll-up
// (answer dims → competencies → overall → readiness, FLOW §8). Everything here is computed
// in code from stored turns; the LLM never sets the final numbers.
import { COMPETENCIES, type Competency, type Delivery, type Stage, type Turn, type TurnResult } from '../schemas.js';

const SKILL_EMA_ALPHA = 0.4;

const round1 = (n: number) => Math.round(n * 10) / 10;

const mean = (values: (number | undefined)[]): number | undefined => {
  const present = values.filter((v): v is number => v !== undefined);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : undefined;
};

/** Turn score = mean of the 5 answer dimensions (0–10). */
export function turnScore(dims: TurnResult['scores']): number {
  const values = Object.values(dims);
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Exponential moving average per competency, only for competencies the answer gave evidence for. */
export function updateSkillEstimate(
  prev: Partial<Record<Competency, number>>,
  signals: TurnResult['competencySignals'],
): Partial<Record<Competency, number>> {
  const next = { ...prev };
  for (const [key, value] of Object.entries(signals) as [Competency, number | undefined][]) {
    if (value === undefined) continue;
    const old = next[key];
    next[key] = round1(old === undefined ? value : SKILL_EMA_ALPHA * value + (1 - SKILL_EMA_ALPHA) * old);
  }
  return next;
}

/** FLOW §7: year 1–2 → 2, otherwise 3; +1 when targeting a senior role. */
export function startingDifficulty(year: number, targetRole: string): number {
  const base = year <= 2 ? 2 : 3;
  return /\b(senior|lead|staff|sde ?(2|ii))\b/i.test(targetRole) ? base + 1 : base;
}

// ---------- Delivery (confidence & vocal delivery). Broad bands only: never accent,
// pronunciation or STT confidence. Floors at 3 so delivery can't sink a candidate on its own.
const DELIVERY_FLOOR = 3;

/** 10 inside [lo, hi], falling linearly to the floor `span` units outside it. */
function bandScore(value: number, lo: number, hi: number, span: number): number {
  const dist = value < lo ? lo - value : value > hi ? value - hi : 0;
  return Math.max(DELIVERY_FLOOR, 10 - (10 - DELIVERY_FLOOR) * (dist / span));
}

export function deliveryScore(d: Delivery): number {
  return round1(
    mean([
      bandScore(d.wpm, 100, 170, 60),
      bandScore(d.fillerRate, 0, 0.03, 0.07),
      bandScore(d.longestPauseSec, 0, 4, 8),
      bandScore(d.latencySec, 0, 5, 10),
    ])!,
  );
}

// ---------- Competency roll-up
type ScoredTurn = Turn & { dims: TurnResult['scores']; score: number };

const isScored = (t: Turn): t is ScoredTurn => t.evaluated && !!t.dims && t.score !== undefined;
const onStage = (t: Turn, ...stages: Stage[]) => stages.includes(t.question.stage);

/** What each scored turn contributes to each competency (FLOW §8 "Fed by"). Undefined = no evidence. */
const CONTRIBUTIONS: Record<Competency, (t: ScoredTurn) => (number | undefined)[]> = {
  clarity: (t) => [mean([t.dims.clarity, t.dims.communication]), t.signals?.clarity],
  delivery: (t) => [t.delivery && t.transcript ? 0.7 * deliveryScore(t.delivery) + 0.3 * t.dims.communication : undefined],
  problemSolving: (t) => [onStage(t, 'problem_solving') ? t.dims.depth : undefined, t.signals?.problemSolving],
  decisionMaking: (t) => [onStage(t, 'decision_making') ? t.score : undefined, t.signals?.decisionMaking],
  technicalKnowledge: (t) => [onStage(t, 'technical', 'project') ? t.dims.technicalAccuracy : undefined, t.signals?.technicalKnowledge],
  projectOwnership: (t) => [onStage(t, 'project') ? t.score : undefined, t.signals?.projectOwnership],
  explanation: (t) => [
    onStage(t, 'technical') ? Math.sqrt(t.dims.clarity * t.dims.technicalAccuracy) : undefined,
    t.signals?.explanation,
  ],
};

/** Overall weights; delivery carries the least (FLOW §8). Sums to 1. */
export const COMPETENCY_WEIGHTS: Record<Competency, number> = {
  technicalKnowledge: 0.2,
  projectOwnership: 0.2,
  problemSolving: 0.15,
  clarity: 0.13,
  decisionMaking: 0.12,
  explanation: 0.12,
  delivery: 0.08,
};

export interface CompetencyScore {
  score: number | null; // 0–10; null when no answer gave evidence for it
  turns: number; // how many answers contributed
}

/** Each competency = mean over scored turns of that turn's contributions. Unevaluated turns are left out. */
export function competencyScores(turns: Turn[]): Record<Competency, CompetencyScore> {
  const scored = turns.filter(isScored);
  const out = {} as Record<Competency, CompetencyScore>;
  for (const c of COMPETENCIES) {
    const perTurn = scored.map((t) => mean(CONTRIBUTIONS[c](t))).filter((v): v is number => v !== undefined);
    out[c] = { score: perTurn.length ? round1(mean(perTurn)!) : null, turns: perTurn.length };
  }
  return out;
}

/** Weighted mean of the competencies that have evidence, re-normalised, on 0–100. */
export function overallScore(competencies: Record<Competency, CompetencyScore>): number | null {
  let total = 0;
  let weight = 0;
  for (const c of COMPETENCIES) {
    const s = competencies[c].score;
    if (s === null) continue;
    total += s * COMPETENCY_WEIGHTS[c];
    weight += COMPETENCY_WEIGHTS[c];
  }
  return weight ? Math.round((total / weight) * 10) : null;
}

export type Readiness = 'ready' | 'almost_ready' | 'needs_practice';

export function readiness(overall: number): Readiness {
  if (overall >= 75) return 'ready';
  if (overall >= 55) return 'almost_ready';
  return 'needs_practice';
}

// ---------- Readiness verdict. Withheld when the interview gave too little to judge (e.g. ended early),
// so one good intro answer can't come out as "Almost ready".
export const MIN_SCORED_MAINS = 3;

export type Verdict = Readiness | 'insufficient_evidence';

export function hasEnoughEvidence(turns: Turn[], competencies: Record<Competency, CompetencyScore>): boolean {
  const scoredMains = turns.filter((t) => isScored(t) && t.question.type === 'main').length;
  return (
    scoredMains >= MIN_SCORED_MAINS &&
    competencies.technicalKnowledge.score !== null &&
    competencies.projectOwnership.score !== null
  );
}

export function verdict(turns: Turn[], competencies: Record<Competency, CompetencyScore>, overall: number | null): Verdict {
  return overall !== null && hasEnoughEvidence(turns, competencies) ? readiness(overall) : 'insufficient_evidence';
}
