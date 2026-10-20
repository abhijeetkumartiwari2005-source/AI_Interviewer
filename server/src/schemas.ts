import { z } from 'zod';

// ---------- Enums ----------
export const STAGES = ['intro', 'project', 'technical', 'problem_solving', 'decision_making'] as const;
export const Stage = z.enum(STAGES);
export type Stage = z.infer<typeof Stage>;

export const PersonaId = z.enum(['p1', 'p2', 'p3']);
export type PersonaId = z.infer<typeof PersonaId>;

export const InterviewType = z.enum(['full_panel', 'technical_focus']);
export type InterviewType = z.infer<typeof InterviewType>;

export const COMPETENCIES = [
  'clarity',
  'delivery',
  'problemSolving',
  'decisionMaking',
  'technicalKnowledge',
  'projectOwnership',
  'explanation',
] as const;
export type Competency = (typeof COMPETENCIES)[number];

// ---------- Candidate profile ----------
export const ProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1500),
  stack: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});

export const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  degree: z.string().trim().min(1).max(80),
  branch: z.string().trim().min(1).max(80),
  year: z.number().int().min(1).max(5),
  targetRole: z.string().trim().min(1).max(80),
  skills: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
  projects: z.array(ProjectSchema).min(1).max(5),
  experience: z.string().trim().max(1500).default(''),
});
export type Profile = z.infer<typeof ProfileSchema>;

// ---------- Questions ----------
export const QuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  persona: PersonaId,
  stage: Stage,
  difficulty: z.number().int().min(1).max(5),
  type: z.enum(['main', 'followup']),
  intent: z.string(),
  parentId: z.string().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

// ---------- Request bodies ----------
export const CreateInterviewBody = z.object({
  profile: ProfileSchema,
  interviewType: InterviewType.default('full_panel'),
});

export const DeliverySchema = z.object({
  wpm: z.number().min(0).max(500),
  fillerRate: z.number().min(0).max(1),
  longestPauseSec: z.number().min(0).max(600),
  latencySec: z.number().min(0).max(600),
});
export type Delivery = z.infer<typeof DeliverySchema>;

export const AnswerBody = z.object({
  questionId: z.string().min(1),
  transcript: z.string().max(8000),
  durationSec: z.number().min(0).max(1800),
  delivery: DeliverySchema.optional(),
});
export type AnswerBody = z.infer<typeof AnswerBody>;

// ---------- LLM turn output (validated before use) ----------
const score = z.number().min(0).max(10);

export const TurnSchema = z.object({
  scores: z.object({
    technicalAccuracy: score,
    relevance: score,
    communication: score,
    clarity: score,
    depth: score,
  }),
  isVague: z.boolean(),
  vagueReason: z.string(),
  claimsToProbe: z.array(z.string()).max(3),
  newStrengths: z.array(z.string()).max(3),
  newWeaknesses: z.array(z.string()).max(3),
  evidenceQuote: z.string(),
  competencySignals: z.object({
    clarity: score.optional(),
    problemSolving: score.optional(),
    decisionMaking: score.optional(),
    technicalKnowledge: score.optional(),
    projectOwnership: score.optional(),
    explanation: score.optional(),
  }),
  feedback: z.string(),
  runningSummary: z.string(),
  candidates: z.object({
    followUp: z.object({
      text: z.string().min(5),
      intent: z.enum(['clarify', 'probe_claim', 'deepen']),
    }),
    nextMain: z.object({
      text: z.string().min(5),
      intent: z.string(),
    }),
  }),
});
export type TurnResult = z.infer<typeof TurnSchema>;

// ---------- Stored session ----------
export interface Turn {
  question: Question;
  transcript: string;
  durationSec: number;
  delivery?: Delivery;
  evaluated: boolean;
  dims?: TurnResult['scores'];
  score?: number;
  signals?: TurnResult['competencySignals'];
  feedback?: string;
  evidenceQuote?: string;
  createdAt: Date;
}

export interface Memory {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  probedClaims: string[];
}

export interface InterviewState {
  _id: string;
  profile: Profile;
  interviewType: InterviewType;
  status: 'active' | 'completed';
  plan: Stage[];
  mainIndex: number;
  difficulty: number;
  currentQuestion: Question | null;
  turns: Turn[];
  memory: Memory;
  skillEstimate: Partial<Record<Competency, number>>;
  followUpsAsked: number;
  consecutiveHigh: number;
  pendingQuestionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
