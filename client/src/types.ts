// Mirrors server/src/schemas.ts (API contract in FLOW.md §10).

export type Stage = 'intro' | 'project' | 'technical' | 'problem_solving' | 'decision_making';
export type PersonaId = 'p1' | 'p2' | 'p3';
export type InterviewType = 'full_panel' | 'technical_focus';

export interface Project {
  title: string;
  description: string;
  stack: string[];
}

export interface Profile {
  name: string;
  degree: string;
  branch: string;
  year: number;
  targetRole: string;
  skills: string[];
  projects: Project[];
  experience: string;
}

export interface Persona {
  id: PersonaId;
  name: string;
  title: string;
  avatar: string;
  voice: { pitch: number; rate: number; preferredVoiceNames: string[] };
}

export interface Question {
  id: string;
  text: string;
  persona: PersonaId;
  stage: Stage;
  difficulty: number;
  type: 'main' | 'followup';
  intent: string;
  parentId?: string;
}

export interface Progress {
  main: number;
  mainTotal: number;
  followUps: number;
  turns: number;
  stage: Stage | null;
}

export interface Delivery {
  wpm: number;
  fillerRate: number;
  longestPauseSec: number;
  latencySec: number;
}

export type Dims = Record<'technicalAccuracy' | 'relevance' | 'communication' | 'clarity' | 'depth', number>;

export interface Evaluation {
  evaluated: boolean;
  score: number | null;
  dims: Dims | null;
  feedback: string | null;
  provider: string | null;
}

export type SkillEstimate = Partial<Record<string, number>>;

export interface CreateResponse {
  interviewId: string;
  panel: Persona[];
  intros: { persona: PersonaId; text: string }[];
  question: Question;
  progress: Progress;
}

export interface AnswerResponse {
  evaluation: Evaluation;
  next: Question | null;
  progress: Progress;
  skillEstimate: SkillEstimate;
  done: boolean;
}

export interface EndResponse {
  status: 'completed';
  closing: { persona: PersonaId; text: string };
}

export interface SessionTurn {
  question: Question;
  transcript: string;
  evaluated: boolean;
  score?: number;
  feedback?: string;
}

export interface SessionState {
  _id: string;
  profile: Profile;
  status: 'active' | 'completed';
  currentQuestion: Question | null;
  turns: SessionTurn[];
  skillEstimate: SkillEstimate;
  panel: Persona[];
  progress: Progress;
}

export interface SampleProfile {
  key: string;
  label: string;
  profile: Profile;
}
