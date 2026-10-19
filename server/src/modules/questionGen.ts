// Template-based questions: panel intros, the opening question, and the "bridge"
// questions used on the degraded path when every LLM provider is down.
import { randomUUID } from 'node:crypto';
import { getBranchPack } from '../catalog.js';
import { PERSONAS, STAGE_PERSONA } from '../personas.js';
import type { InterviewState, PersonaId, Profile, Question, Stage } from '../schemas.js';

export const newQuestionId = () => randomUUID().slice(0, 8);

const firstName = (p: Profile) => p.name.split(/\s+/)[0] ?? p.name;
const mainProject = (p: Profile) => p.projects[0]!.title;

export function personaIntros(profile: Profile): { persona: PersonaId; text: string }[] {
  const branch = getBranchPack(profile.branch);
  return [
    {
      persona: 'p1',
      text: `Hello ${firstName(profile)}, welcome. I'm ${PERSONAS.p1.name}, and I'll be leading the panel today.`,
    },
    {
      persona: 'p2',
      text: `Hi, I'm ${PERSONAS.p2.name.split(' ')[0]}, a technical lead. I'll ask about your projects and core ${branch.label} concepts.`,
    },
    {
      persona: 'p3',
      text: `And I'm ${PERSONAS.p3.name.split(' ')[0]}, an engineering manager. I'll give you a few practical scenarios to think through.`,
    },
  ];
}

export function openingQuestion(profile: Profile, difficulty: number): Question {
  return {
    id: newQuestionId(),
    text: `Let's begin. Please introduce yourself and briefly explain your project, ${mainProject(profile)}.`,
    persona: STAGE_PERSONA.intro,
    stage: 'intro',
    difficulty,
    type: 'main',
    intent: 'introduction',
  };
}

export function closingLine(profile: Profile): { persona: PersonaId; text: string } {
  return {
    persona: 'p1',
    text: `Thank you, ${firstName(profile)}. That's all from the panel today. We'll put together your feedback report now.`,
  };
}

/** Used when no LLM is available. Grounded in the student's project + branch pack, never a fixed bank. */
export function bridgeQuestion(state: InterviewState, stage: Stage, difficulty: number): Question {
  const branch = getBranchPack(state.profile.branch);
  const project = mainProject(state.profile);
  const n = state.turns.length; // rotate through options so repeats are unlikely
  const pick = <T>(arr: T[]) => arr[n % arr.length]!;

  const text: Record<Stage, string> = {
    intro: `Please introduce yourself and briefly explain your project, ${project}.`,
    project: `In ${project}, what was one important decision you made about ${pick(branch.projectProbes)}, and why?`,
    technical: `Let's talk about ${pick(branch.coreAreas)}. Can you explain it and how it relates to work you've done?`,
    problem_solving: `Here's a scenario: ${pick(branch.scenarioSeeds)}. How would you approach it?`,
    decision_making: `If you had to redo ${project} with half the time, what would you cut, what would you keep, and why?`,
  };

  return {
    id: newQuestionId(),
    text: text[stage],
    persona: STAGE_PERSONA[stage],
    stage,
    difficulty,
    type: 'main',
    intent: 'bridge (evaluation unavailable)',
  };
}
