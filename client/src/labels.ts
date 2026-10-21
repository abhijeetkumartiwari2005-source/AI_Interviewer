// Display labels shared across pages.
import type { Competency, Dims, Stage } from './types';

export const STAGE_LABEL: Record<Stage, string> = {
  intro: 'Introduction',
  project: 'Project deep dive',
  technical: 'Technical',
  problem_solving: 'Problem-solving',
  decision_making: 'Decision-making',
};

export const DIM_LABEL: Record<keyof Dims, string> = {
  technicalAccuracy: 'Accuracy',
  relevance: 'Relevance',
  communication: 'Communication',
  clarity: 'Clarity',
  depth: 'Depth',
};

// Short labels for the live skill estimate (the full rubric labels are on the report).
export const COMPETENCY_SHORT: Record<Competency, string> = {
  technicalKnowledge: 'Technical knowledge',
  projectOwnership: 'Project ownership',
  problemSolving: 'Problem-solving',
  decisionMaking: 'Decision-making',
  clarity: 'Clarity',
  explanation: 'Explaining concepts',
  delivery: 'Vocal delivery',
};
