import { describe, expect, it } from 'vitest';
import {
  COMPETENCY_WEIGHTS,
  competencyScores,
  deliveryScore,
  overallScore,
  readiness,
  startingDifficulty,
  verdict,
  turnScore,
  updateSkillEstimate,
} from '../src/modules/scoring.js';
import type { Delivery, Stage, Turn, TurnResult } from '../src/schemas.js';

const dims = (v: number, overrides: Partial<TurnResult['scores']> = {}): TurnResult['scores'] => ({
  technicalAccuracy: v,
  relevance: v,
  communication: v,
  clarity: v,
  depth: v,
  ...overrides,
});

const GOOD_DELIVERY: Delivery = { wpm: 130, fillerRate: 0.01, longestPauseSec: 2, latencySec: 2 };

function turn(stage: Stage, d: TurnResult['scores'] | null, extra: Partial<Turn> = {}): Turn {
  return {
    question: { id: 'q', text: 'q', persona: 'p2', stage, difficulty: 3, type: 'main', intent: 'test' },
    transcript: 'an answer',
    durationSec: 30,
    evaluated: d !== null,
    ...(d && { dims: d, score: turnScore(d) }),
    createdAt: new Date(0),
    ...extra,
  };
}

describe('turnScore', () => {
  it('is the mean of the five dimensions, rounded to 1dp', () => {
    expect(turnScore(dims(6, { depth: 7, clarity: 8 }))).toBe(6.6);
  });
});

describe('updateSkillEstimate', () => {
  it('takes the first signal as-is, then applies an EMA with α = 0.4', () => {
    const first = updateSkillEstimate({}, { clarity: 5 });
    expect(first).toEqual({ clarity: 5 });
    expect(updateSkillEstimate(first, { clarity: 10, problemSolving: 7 })).toEqual({ clarity: 7, problemSolving: 7 });
  });

  it('leaves competencies without a signal untouched', () => {
    expect(updateSkillEstimate({ clarity: 4 }, { clarity: undefined })).toEqual({ clarity: 4 });
  });
});

describe('startingDifficulty', () => {
  it('starts juniors lower and bumps senior targets', () => {
    expect(startingDifficulty(1, 'SDE Intern')).toBe(2);
    expect(startingDifficulty(4, 'Software Engineer')).toBe(3);
    expect(startingDifficulty(4, 'Senior Engineer')).toBe(4);
    expect(startingDifficulty(2, 'SDE II')).toBe(3);
  });
});

describe('deliveryScore', () => {
  it('gives 10 inside every band', () => {
    expect(deliveryScore(GOOD_DELIVERY)).toBe(10);
  });

  it('falls off outside the bands but never below the floor', () => {
    const slowAndHesitant = deliveryScore({ wpm: 70, fillerRate: 0.05, longestPauseSec: 6, latencySec: 5 });
    expect(slowAndHesitant).toBeGreaterThan(3);
    expect(slowAndHesitant).toBeLessThan(10);
    expect(deliveryScore({ wpm: 0, fillerRate: 1, longestPauseSec: 600, latencySec: 600 })).toBe(3);
  });

  it('treats too fast like too slow', () => {
    expect(deliveryScore({ ...GOOD_DELIVERY, wpm: 200 })).toBe(deliveryScore({ ...GOOD_DELIVERY, wpm: 70 }));
  });
});

describe('competencyScores', () => {
  it('routes each dimension to the competencies FLOW §8 says it feeds', () => {
    const c = competencyScores([
      turn('intro', dims(6)),
      turn('project', dims(8, { technicalAccuracy: 6 })),
      turn('technical', dims(5, { clarity: 9, technicalAccuracy: 4 })),
      turn('problem_solving', dims(7, { depth: 3 })),
      turn('decision_making', dims(9)),
    ]);

    expect(c.problemSolving).toEqual({ score: 3, turns: 1 }); // depth on the problem-solving turn only
    expect(c.decisionMaking).toEqual({ score: 9, turns: 1 });
    expect(c.technicalKnowledge).toEqual({ score: 5, turns: 2 }); // technicalAccuracy on project (6) + technical (4)
    expect(c.projectOwnership).toEqual({ score: turnScore(dims(8, { technicalAccuracy: 6 })), turns: 1 });
    expect(c.explanation).toEqual({ score: 6, turns: 1 }); // √(9 × 4)
    expect(c.clarity.turns).toBe(5); // every scored answer
  });

  it('blends LLM competency signals with the dimension-based value per turn', () => {
    const c = competencyScores([turn('problem_solving', dims(5, { depth: 4 }), { signals: { problemSolving: 8 } })]);
    expect(c.problemSolving.score).toBe(6);
  });

  it('uses a signal alone when the stage gives no dimension evidence', () => {
    const c = competencyScores([turn('intro', dims(5), { signals: { projectOwnership: 7 } })]);
    expect(c.projectOwnership).toEqual({ score: 7, turns: 1 });
  });

  it('leaves out unevaluated turns entirely', () => {
    const c = competencyScores([turn('technical', dims(8)), turn('technical', null)]);
    expect(c.technicalKnowledge).toEqual({ score: 8, turns: 1 });
  });

  it('reports no evidence as null, not zero', () => {
    const c = competencyScores([turn('intro', dims(7))]);
    expect(c.decisionMaking).toEqual({ score: null, turns: 0 });
    expect(c.delivery).toEqual({ score: null, turns: 0 }); // no delivery metrics (text mode)
  });

  it('scores delivery from metrics plus communication, only for spoken answers', () => {
    const c = competencyScores([
      turn('intro', dims(5), { delivery: GOOD_DELIVERY }),
      turn('project', dims(5), { delivery: GOOD_DELIVERY, transcript: '' }),
    ]);
    expect(c.delivery).toEqual({ score: 8.5, turns: 1 }); // 0.7 × 10 + 0.3 × 5
  });
});

describe('overallScore and readiness', () => {
  it('has weights that sum to 1 with delivery the lightest', () => {
    const weights = Object.values(COMPETENCY_WEIGHTS);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(Math.min(...weights)).toBe(COMPETENCY_WEIGHTS.delivery);
  });

  it('is the weighted mean on 0–100, re-normalised over competencies with evidence', () => {
    const c = competencyScores([turn('intro', dims(7))]); // only clarity has evidence
    expect(overallScore(c)).toBe(70);
  });

  it('is null when nothing was evaluated', () => {
    expect(overallScore(competencyScores([turn('project', null)]))).toBeNull();
  });

  it('maps to readiness bands at 75 and 55', () => {
    expect(readiness(75)).toBe('ready');
    expect(readiness(74)).toBe('almost_ready');
    expect(readiness(55)).toBe('almost_ready');
    expect(readiness(54)).toBe('needs_practice');
  });
});

describe('verdict (readiness with an evidence floor)', () => {
  const full = [turn('intro', dims(8)), turn('project', dims(8)), turn('technical', dims(8)), turn('problem_solving', dims(8))];

  it('gives a readiness class when enough was answered', () => {
    const c = competencyScores(full);
    expect(verdict(full, c, overallScore(c))).toBe('ready');
  });

  it('withholds readiness after fewer than 3 scored main answers', () => {
    const early = full.slice(0, 2);
    const c = competencyScores(early);
    expect(overallScore(c)).not.toBeNull();
    expect(verdict(early, c, overallScore(c))).toBe('insufficient_evidence');
  });

  it('does not count follow-ups or unevaluated turns toward the minimum', () => {
    const turns = [
      turn('intro', dims(8)),
      turn('project', dims(8)),
      turn('project', dims(8), { question: { ...full[1]!.question, type: 'followup' } }),
      turn('technical', null),
    ];
    const c = competencyScores(turns);
    expect(verdict(turns, c, overallScore(c))).toBe('insufficient_evidence');
  });

  it('withholds readiness when technical knowledge or project ownership has no evidence', () => {
    const noProject = [turn('intro', dims(8)), turn('technical', dims(8)), turn('problem_solving', dims(8)), turn('decision_making', dims(8))];
    const c = competencyScores(noProject);
    expect(verdict(noProject, c, overallScore(c))).toBe('insufficient_evidence');
  });
});
