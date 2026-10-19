import type { PersonaId, Stage } from './schemas.js';

export interface Persona {
  id: PersonaId;
  name: string;
  title: string;
  avatar: string; // client asset key
  style: string; // fed to the LLM so phrasing matches the persona
  voice: { pitch: number; rate: number; preferredVoiceNames: string[] };
}

export const PERSONAS: Record<PersonaId, Persona> = {
  p1: {
    id: 'p1',
    name: 'Priya Sharma',
    title: 'Panel Lead (HR)',
    avatar: 'priya',
    style: 'Warm and encouraging. Opens and closes the interview. Short, plain sentences.',
    voice: { pitch: 1.1, rate: 1.0, preferredVoiceNames: ['Google UK English Female', 'Microsoft Heera', 'Samantha'] },
  },
  p2: {
    id: 'p2',
    name: 'Arjun Mehta',
    title: 'Technical Lead',
    avatar: 'arjun',
    style: 'Direct and curious. Probes technical claims: "why X over Y", "how exactly did you implement". One question at a time.',
    voice: { pitch: 0.9, rate: 1.0, preferredVoiceNames: ['Google UK English Male', 'Microsoft Ravi', 'Daniel'] },
  },
  p3: {
    id: 'p3',
    name: 'Kavita Rao',
    title: 'Engineering Manager',
    avatar: 'kavita',
    style: 'Calm and practical. Frames realistic scenarios and asks the candidate to prioritise and justify decisions.',
    voice: { pitch: 1.0, rate: 0.95, preferredVoiceNames: ['Google US English', 'Microsoft Zira', 'Karen'] },
  },
};

// Persona that owns each stage (FLOW §2). Code decides this, not the LLM.
export const STAGE_PERSONA: Record<Stage, PersonaId> = {
  intro: 'p1',
  project: 'p2',
  technical: 'p2',
  problem_solving: 'p3',
  decision_making: 'p3',
};
