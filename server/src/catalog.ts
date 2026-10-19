// Loads the static JSON data (branch packs, rubrics, sample profiles) once at startup.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Profile } from './schemas.js';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(dataDir, file), 'utf8')) as T;

export interface BranchPack {
  key: string;
  label: string;
  aliases: string[];
  coreAreas: string[];
  projectProbes: string[];
  scenarioSeeds: string[];
}

const branchPacks: BranchPack[] = readdirSync(path.join(dataDir, 'branches'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJson<BranchPack>(path.join('branches', f)));

const genericPack = branchPacks.find((b) => b.key === 'generic')!;

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Maps a free-text branch ("Computer Sci & Engg", "CIVIL") to a branch pack; unknown → generic. */
export function getBranchPack(branch: string): BranchPack {
  const b = normalise(branch);
  return (
    branchPacks.find((p) => p.aliases.some((a) => normalise(a) === b)) ??
    branchPacks.find((p) => p.aliases.some((a) => a.length > 3 && b.includes(normalise(a)))) ??
    genericPack
  );
}

export const rubrics = readJson<{
  answerDimensions: Record<string, Record<string, string>>;
  competencies: Record<string, Record<string, string>>;
}>('rubrics.json');

export const sampleProfiles = readJson<{ key: string; label: string; profile: Profile }[]>('sampleProfiles.json');
