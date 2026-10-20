// Display labels shared across pages.
import type { Dims, Stage } from './types';

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
