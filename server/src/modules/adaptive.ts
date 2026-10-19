// Deterministic adaptive rules (FLOW §7). Pure: no I/O, no LLM. The LLM proposes, this decides.
import type { Question, Stage } from '../schemas.js';

export const MAX_TURNS = 11;
export const MIN_FOLLOWUPS = 2;
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 5;
const SHORT_ANSWER_WORDS = 25;
const PROBE_STAGES: Stage[] = ['project', 'technical'];

export interface DecideInput {
  plan: Stage[];
  mainIndex: number;
  difficulty: number;
  currentQuestion: Question;
  followUpsAsked: number;
  consecutiveHigh: number;
  turnsSoFar: number; // including the turn being answered now
  wordCount: number;
  evaluation: { score: number; isVague: boolean; claimsToProbe: number } | null; // null = degraded path
}

export type FollowUpIntent = 'clarify' | 'probe_claim' | 'deepen';

export type Decision =
  | { action: 'followup'; intent: FollowUpIntent; difficulty: number; consecutiveHigh: number }
  | { action: 'next'; nextStage: Stage; difficulty: number; consecutiveHigh: number; stretch: boolean }
  | { action: 'done'; difficulty: number; consecutiveHigh: number };

const clamp = (d: number) => Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, d));

export function decide(input: DecideInput): Decision {
  const { plan, mainIndex, difficulty, currentQuestion, evaluation } = input;
  const nextStage = plan[mainIndex + 1];
  const outOfTurns = input.turnsSoFar >= MAX_TURNS;

  // Degraded path: no evaluation → never follow up, keep difficulty.
  if (!evaluation) {
    if (!nextStage || outOfTurns) return { action: 'done', difficulty, consecutiveHigh: 0 };
    return { action: 'next', nextStage, difficulty, consecutiveHigh: 0, stretch: false };
  }

  const { score, isVague, claimsToProbe } = evaluation;
  let consecutiveHigh = score >= 8 ? input.consecutiveHigh + 1 : 0;

  if (outOfTurns) return { action: 'done', difficulty, consecutiveHigh };

  // Follow-ups: max 1 per main question (never a follow-up of a follow-up), never on the intro.
  const canFollowUp = currentQuestion.type === 'main' && currentQuestion.stage !== 'intro' && input.turnsSoFar < MAX_TURNS - 1;
  if (canFollowUp) {
    const vague = isVague || (score >= 4 && score <= 6 && input.wordCount < SHORT_ANSWER_WORDS);
    // Guarantee ≥2 follow-ups per interview: from the 4th main question on, lower the bar.
    const behindQuota = input.followUpsAsked < MIN_FOLLOWUPS && mainIndex >= 3;
    // Also make sure a quota follow-up is still possible before the plan runs out.
    const mainsLeft = plan.length - mainIndex; // including the current one
    const mustFollowUp = input.followUpsAsked + mainsLeft <= MIN_FOLLOWUPS;

    let intent: FollowUpIntent | null = null;
    if (vague) intent = 'clarify';
    else if (claimsToProbe > 0 && PROBE_STAGES.includes(currentQuestion.stage)) intent = 'probe_claim';
    else if (behindQuota || mustFollowUp) intent = score <= 6 ? 'clarify' : 'deepen';

    if (intent) return { action: 'followup', intent, difficulty, consecutiveHigh };
  }

  if (!nextStage) return { action: 'done', difficulty, consecutiveHigh };

  let next = difficulty;
  let stretch = false;
  if (score <= 3) next -= 1;
  else if (score >= 8) {
    next += 1;
    if (consecutiveHigh >= 2) {
      next += 1;
      stretch = true;
      consecutiveHigh = 0;
    }
  }
  return { action: 'next', nextStage, difficulty: clamp(next), consecutiveHigh, stretch };
}
