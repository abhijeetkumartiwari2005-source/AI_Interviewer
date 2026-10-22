// Orchestrates the interview: create → (load → evaluate → adapt → persist → respond)* → end.
import { isValidObjectId } from 'mongoose';
import { InterviewModel, toState } from '../db.js';
import { AppError } from '../middleware/error.js';
import { PERSONAS, STAGE_PERSONA } from '../personas.js';
import type { AnswerBody, InterviewState, InterviewType, Memory, Profile, Question, Stage, Turn } from '../schemas.js';
import { decide } from './adaptive.js';
import { evaluateTurn } from './evaluator.js';
import { bridgeQuestion, closingLine, newQuestionId, openingQuestion, personaIntros } from './questionGen.js';
import { startingDifficulty, turnScore, updateSkillEstimate } from './scoring.js';

const PLANS: Record<InterviewType, Stage[]> = {
  full_panel: ['intro', 'project', 'project', 'technical', 'problem_solving', 'decision_making'],
  technical_focus: ['intro', 'project', 'technical', 'technical', 'problem_solving', 'decision_making'],
};

const MEMORY_LIST_CAP = 8;

const publicPanel = () =>
  Object.values(PERSONAS).map(({ id, name, title, avatar, voice }) => ({ id, name, title, avatar, voice }));

function progressOf(s: Pick<InterviewState, 'plan' | 'mainIndex' | 'followUpsAsked' | 'turns' | 'currentQuestion'>) {
  return {
    main: Math.min(s.mainIndex + 1, s.plan.length),
    mainTotal: s.plan.length,
    followUps: s.followUpsAsked,
    turns: s.turns.length,
    stage: s.currentQuestion?.stage ?? null,
  };
}

async function loadOr404(id: string) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Interview not found');
  const doc = await InterviewModel.findById(id).lean();
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Interview not found');
  return toState(doc);
}

export async function createInterview(profile: Profile, interviewType: InterviewType) {
  const plan = PLANS[interviewType];
  const difficulty = startingDifficulty(profile.year, profile.targetRole);
  const question = openingQuestion(profile, difficulty);

  const doc = await InterviewModel.create({ profile, interviewType, plan, difficulty, currentQuestion: question });

  return {
    interviewId: String(doc._id),
    panel: publicPanel(),
    intros: personaIntros(profile),
    question,
    progress: progressOf({ plan, mainIndex: 0, followUpsAsked: 0, turns: [], currentQuestion: question }),
  };
}

export async function getInterview(id: string) {
  const { pendingQuestionId: _lock, report: _report, ...state } = await loadOr404(id);
  return { ...state, panel: publicPanel(), progress: progressOf(state) };
}

export async function submitAnswer(id: string, body: AnswerBody) {
  if (!isValidObjectId(id)) throw new AppError(404, 'NOT_FOUND', 'Interview not found');

  // Atomically claim this question so a double submit can't evaluate it twice.
  const claimed = await InterviewModel.findOneAndUpdate(
    { _id: id, status: 'active', 'currentQuestion.id': body.questionId, pendingQuestionId: null },
    { $set: { pendingQuestionId: body.questionId } },
    { returnDocument: 'after' },
  ).lean();

  if (!claimed) {
    const existing = await loadOr404(id);
    if (existing.status === 'completed') throw new AppError(409, 'INTERVIEW_COMPLETED', 'Interview already completed');
    throw new AppError(
      409,
      'STALE_QUESTION',
      existing.pendingQuestionId === body.questionId ? 'This answer is already being processed' : 'questionId is not the current question',
    );
  }

  try {
    return await processTurn(toState(claimed), body);
  } catch (err) {
    await InterviewModel.updateOne({ _id: id, pendingQuestionId: body.questionId }, { $set: { pendingQuestionId: null } });
    throw err;
  }
}

async function processTurn(state: InterviewState, body: AnswerBody) {
  const q = state.currentQuestion!;
  const transcript = body.transcript.trim();
  const wordCount = transcript ? transcript.split(/\s+/).length : 0;

  const evaluation = await evaluateTurn(state, transcript, body.durationSec);
  const result = evaluation?.result;
  const score = result ? turnScore(result.scores) : undefined;

  const decision = decide({
    plan: state.plan,
    mainIndex: state.mainIndex,
    difficulty: state.difficulty,
    currentQuestion: q,
    followUpsAsked: state.followUpsAsked,
    consecutiveHigh: state.consecutiveHigh,
    turnsSoFar: state.turns.length + 1,
    wordCount,
    evaluation: result ? { score: score!, isVague: result.isVague, claimsToProbe: result.claimsToProbe.length } : null,
  });

  // ---- Build the next question from the LLM's candidates (or a bridge template if degraded)
  let next: Question | null = null;
  let mainIndex = state.mainIndex;
  let followUpsAsked = state.followUpsAsked;

  if (decision.action === 'followup' && result) {
    next = {
      id: newQuestionId(),
      text: result.candidates.followUp.text,
      persona: q.persona,
      stage: q.stage,
      difficulty: q.difficulty,
      type: 'followup',
      intent: decision.intent,
      parentId: q.type === 'main' ? q.id : q.parentId,
    };
    followUpsAsked += 1;
  } else if (decision.action === 'next') {
    mainIndex += 1;
    next = result
      ? {
          id: newQuestionId(),
          text: result.candidates.nextMain.text,
          persona: STAGE_PERSONA[decision.nextStage],
          stage: decision.nextStage,
          difficulty: decision.difficulty,
          type: 'main',
          intent: decision.stretch ? `stretch: ${result.candidates.nextMain.intent}` : result.candidates.nextMain.intent,
        }
      : bridgeQuestion(state, decision.nextStage, decision.difficulty);
  }

  // ---- Persist
  const turn: Turn = {
    question: q,
    transcript,
    durationSec: body.durationSec,
    ...(body.delivery && { delivery: body.delivery }),
    evaluated: !!result,
    ...(result && {
      dims: result.scores,
      score,
      signals: result.competencySignals,
      feedback: result.feedback,
      evidenceQuote: result.evidenceQuote,
    }),
    createdAt: new Date(),
  };

  const memory: Memory = result
    ? {
        summary: result.runningSummary,
        strengths: mergeCapped(state.memory.strengths, result.newStrengths),
        weaknesses: mergeCapped(state.memory.weaknesses, result.newWeaknesses),
        probedClaims:
          decision.action === 'followup' && decision.intent === 'probe_claim' && result.claimsToProbe[0]
            ? mergeCapped(state.memory.probedClaims, [result.claimsToProbe[0]])
            : state.memory.probedClaims,
      }
    : state.memory;

  const skillEstimate = result ? updateSkillEstimate(state.skillEstimate, result.competencySignals) : state.skillEstimate;

  await InterviewModel.updateOne(
    { _id: state._id, pendingQuestionId: q.id },
    {
      $push: { turns: turn },
      $set: {
        currentQuestion: next,
        mainIndex,
        difficulty: decision.difficulty,
        followUpsAsked,
        consecutiveHigh: decision.consecutiveHigh,
        memory,
        skillEstimate,
        pendingQuestionId: null,
      },
    },
  );

  const after = { plan: state.plan, mainIndex, followUpsAsked, turns: [...state.turns, turn], currentQuestion: next };
  return {
    evaluation: {
      evaluated: !!result,
      score: score ?? null,
      dims: result?.scores ?? null,
      feedback: result?.feedback ?? null,
      provider: evaluation?.provider ?? null,
    },
    next,
    progress: progressOf(after),
    skillEstimate,
    done: next === null,
  };
}

export async function endInterview(id: string) {
  const state = await loadOr404(id);
  if (state.status !== 'completed') {
    // A question still pending means the candidate stopped before the plan finished.
    const endedEarly = state.currentQuestion !== null;
    await InterviewModel.updateOne(
      { _id: id },
      { $set: { status: 'completed', currentQuestion: null, pendingQuestionId: null, endedEarly } },
    );
  }
  return { status: 'completed' as const, closing: closingLine(state.profile) };
}

function mergeCapped(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((s) => s.toLowerCase()));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.toLowerCase())) {
      merged.push(item);
      seen.add(item.toLowerCase());
    }
  }
  return merged.slice(-MEMORY_LIST_CAP);
}
