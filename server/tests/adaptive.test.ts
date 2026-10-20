import { describe, expect, it } from 'vitest';
import { decide, MAX_TURNS, type DecideInput } from '../src/modules/adaptive.js';
import type { Question, Stage } from '../src/schemas.js';

const PLAN: Stage[] = ['intro', 'project', 'project', 'technical', 'problem_solving', 'decision_making'];

const question = (stage: Stage, type: Question['type'] = 'main'): Question => ({
  id: 'q',
  text: 'question',
  persona: 'p2',
  stage,
  difficulty: 3,
  type,
  intent: 'test',
});

/** A solid, unremarkable answer to the 2nd main question; override what each test is about. */
function input(overrides: Partial<DecideInput> = {}): DecideInput {
  return {
    plan: PLAN,
    mainIndex: 1,
    difficulty: 3,
    currentQuestion: question('project'),
    followUpsAsked: 0,
    consecutiveHigh: 0,
    turnsSoFar: 2,
    wordCount: 80,
    evaluation: { score: 6, isVague: false, claimsToProbe: 0 },
    ...overrides,
  };
}

describe('adaptive.decide', () => {
  describe('follow-ups', () => {
    it('clarifies a vague answer', () => {
      const d = decide(input({ evaluation: { score: 7, isVague: true, claimsToProbe: 0 } }));
      expect(d).toMatchObject({ action: 'followup', intent: 'clarify', difficulty: 3 });
    });

    it('clarifies a short mid-scoring answer', () => {
      const d = decide(input({ wordCount: 12, evaluation: { score: 5, isVague: false, claimsToProbe: 0 } }));
      expect(d).toMatchObject({ action: 'followup', intent: 'clarify' });
    });

    it('does not clarify a short answer that scored well', () => {
      const d = decide(input({ wordCount: 12, evaluation: { score: 8, isVague: false, claimsToProbe: 0 } }));
      expect(d.action).toBe('next');
    });

    it('probes a claim on project and technical stages', () => {
      for (const stage of ['project', 'technical'] as const) {
        const d = decide(input({ currentQuestion: question(stage), evaluation: { score: 7, isVague: false, claimsToProbe: 1 } }));
        expect(d).toMatchObject({ action: 'followup', intent: 'probe_claim' });
      }
    });

    it('does not probe claims on scenario stages', () => {
      const d = decide(
        input({ mainIndex: 4, followUpsAsked: 2, currentQuestion: question('problem_solving'), evaluation: { score: 7, isVague: false, claimsToProbe: 2 } }),
      );
      expect(d.action).toBe('next');
    });

    it('never follows up on a follow-up', () => {
      const d = decide(input({ currentQuestion: question('project', 'followup'), evaluation: { score: 5, isVague: true, claimsToProbe: 1 } }));
      expect(d.action).toBe('next');
    });

    it('never follows up on the intro', () => {
      const d = decide(input({ mainIndex: 0, turnsSoFar: 1, currentQuestion: question('intro'), evaluation: { score: 5, isVague: true, claimsToProbe: 0 } }));
      expect(d).toMatchObject({ action: 'next', nextStage: 'project' });
    });

    it('does not start a follow-up on the second-to-last allowed turn', () => {
      const d = decide(input({ turnsSoFar: MAX_TURNS - 1, evaluation: { score: 5, isVague: true, claimsToProbe: 0 } }));
      expect(d.action).toBe('next');
    });
  });

  describe('follow-up quota (≥2 per interview)', () => {
    it('deepens a good answer when behind quota from the 4th main question', () => {
      const d = decide(input({ mainIndex: 3, turnsSoFar: 4, currentQuestion: question('technical'), evaluation: { score: 8, isVague: false, claimsToProbe: 0 } }));
      expect(d).toMatchObject({ action: 'followup', intent: 'deepen' });
    });

    it('clarifies a weaker answer when behind quota', () => {
      const d = decide(input({ mainIndex: 3, turnsSoFar: 4, currentQuestion: question('technical'), evaluation: { score: 6, isVague: false, claimsToProbe: 0 } }));
      expect(d).toMatchObject({ action: 'followup', intent: 'clarify' });
    });

    it('does not force follow-ups once the quota is met', () => {
      const d = decide(input({ mainIndex: 3, followUpsAsked: 2, turnsSoFar: 6, currentQuestion: question('technical') }));
      expect(d.action).toBe('next');
    });

    it('does not force a follow-up early in the interview', () => {
      expect(decide(input()).action).toBe('next');
    });
  });

  describe('difficulty', () => {
    it('keeps difficulty for a 4–7 score', () => {
      expect(decide(input({ evaluation: { score: 7, isVague: false, claimsToProbe: 0 } }))).toMatchObject({ action: 'next', difficulty: 3 });
    });

    it('drops one level on a weak answer, never below 1', () => {
      expect(decide(input({ evaluation: { score: 3, isVague: false, claimsToProbe: 0 } }))).toMatchObject({ difficulty: 2 });
      expect(decide(input({ difficulty: 1, evaluation: { score: 1, isVague: false, claimsToProbe: 0 } }))).toMatchObject({ difficulty: 1 });
    });

    it('raises one level on a strong answer, never above 5', () => {
      expect(decide(input({ evaluation: { score: 8, isVague: false, claimsToProbe: 0 } }))).toMatchObject({
        difficulty: 4,
        consecutiveHigh: 1,
        stretch: false,
      });
      expect(decide(input({ difficulty: 5, evaluation: { score: 9, isVague: false, claimsToProbe: 0 } }))).toMatchObject({ difficulty: 5 });
    });

    it('stretches after two strong answers in a row and resets the streak', () => {
      const d = decide(input({ consecutiveHigh: 1, evaluation: { score: 9, isVague: false, claimsToProbe: 0 } }));
      expect(d).toMatchObject({ action: 'next', difficulty: 5, stretch: true, consecutiveHigh: 0 });
    });

    it('breaks the streak on a weaker answer', () => {
      const d = decide(input({ consecutiveHigh: 1, evaluation: { score: 6, isVague: false, claimsToProbe: 0 } }));
      expect(d).toMatchObject({ consecutiveHigh: 0 });
    });
  });

  describe('stage plan and termination', () => {
    it('advances to the next planned stage', () => {
      expect(decide(input({ mainIndex: 2, followUpsAsked: 1 }))).toMatchObject({ action: 'next', nextStage: 'technical' });
    });

    it('finishes after the last planned question', () => {
      const d = decide(input({ mainIndex: 5, followUpsAsked: 2, turnsSoFar: 8, currentQuestion: question('decision_making') }));
      expect(d.action).toBe('done');
    });

    it('finishes at the turn cap even mid-plan', () => {
      const d = decide(input({ turnsSoFar: MAX_TURNS, evaluation: { score: 5, isVague: true, claimsToProbe: 1 } }));
      expect(d.action).toBe('done');
    });
  });

  describe('degraded path (no evaluation)', () => {
    it('moves on without a follow-up and keeps difficulty', () => {
      const d = decide(input({ consecutiveHigh: 1, evaluation: null }));
      expect(d).toEqual({ action: 'next', nextStage: 'project', difficulty: 3, consecutiveHigh: 0, stretch: false });
    });

    it('finishes when the plan is used up', () => {
      expect(decide(input({ mainIndex: 5, evaluation: null })).action).toBe('done');
    });
  });
});
