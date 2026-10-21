// Runs one evaluation turn against the real LLM without needing MongoDB.
// Useful for prompt tuning:  npx tsx scripts/evalOnce.ts [cse|production] "answer text"
import { sampleProfiles } from '../src/catalog.js';
import { decide } from '../src/modules/adaptive.js';
import { evaluateTurn } from '../src/modules/evaluator.js';
import { openingQuestion } from '../src/modules/questionGen.js';
import { turnScore } from '../src/modules/scoring.js';
import type { InterviewState } from '../src/schemas.js';

const [key = 'cse', answer = 'I made a placement portal using React and Node. It is a good project and it works well.'] =
  process.argv.slice(2);
const profile = sampleProfiles.find((p) => p.key === key)!.profile;

const intro = openingQuestion(profile, 3);
const state: InterviewState = {
  _id: 'local',
  profile,
  interviewType: 'full_panel',
  status: 'active',
  plan: ['intro', 'project', 'project', 'technical', 'problem_solving', 'decision_making'],
  mainIndex: 1,
  difficulty: 3,
  currentQuestion: {
    id: 'q2',
    text: `Why did you choose ${profile.projects[0]!.stack.slice(0, 2).join(' and ')} for ${profile.projects[0]!.title}?`,
    persona: 'p2',
    stage: 'project',
    difficulty: 3,
    type: 'main',
    intent: 'stack justification',
  },
  turns: [
    {
      question: intro,
      transcript: `Hi, I'm ${profile.name}, final year ${profile.branch}. ${profile.projects[0]!.description}`,
      durationSec: 40,
      evaluated: true,
      score: 6,
      createdAt: new Date(),
    },
  ],
  memory: { summary: '', strengths: [], weaknesses: [], probedClaims: [] },
  skillEstimate: {},
  followUpsAsked: 0,
  consecutiveHigh: 0,
  pendingQuestionId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

console.log(`Q: ${state.currentQuestion!.text}\nA: ${answer}\n`);
const res = await evaluateTurn(state, answer, 20);
if (!res) {
  console.log('Degraded path (no LLM available)');
  process.exit(1);
}
const score = turnScore(res.result.scores);
console.log(JSON.stringify(res.result, null, 2));
console.log('\nturn score:', score, 'via', res.provider);
console.log(
  'decision:',
  decide({
    plan: state.plan,
    mainIndex: state.mainIndex,
    difficulty: state.difficulty,
    currentQuestion: state.currentQuestion!,
    followUpsAsked: 0,
    consecutiveHigh: 0,
    turnsSoFar: 2,
    wordCount: answer.split(/\s+/).length,
    evaluation: { score, isVague: res.result.isVague, claimsToProbe: res.result.claimsToProbe.length },
  }),
);
