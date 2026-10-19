// Pure scoring helpers. Competency roll-up + readiness for the report land here on Day 4.
import type { Competency, TurnResult } from '../schemas.js';

const SKILL_EMA_ALPHA = 0.4;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Turn score = mean of the 5 answer dimensions (0–10). */
export function turnScore(dims: TurnResult['scores']): number {
  const values = Object.values(dims);
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Exponential moving average per competency, only for competencies the answer gave evidence for. */
export function updateSkillEstimate(
  prev: Partial<Record<Competency, number>>,
  signals: TurnResult['competencySignals'],
): Partial<Record<Competency, number>> {
  const next = { ...prev };
  for (const [key, value] of Object.entries(signals) as [Competency, number | undefined][]) {
    if (value === undefined) continue;
    const old = next[key];
    next[key] = round1(old === undefined ? value : SKILL_EMA_ALPHA * value + (1 - SKILL_EMA_ALPHA) * old);
  }
  return next;
}

/** FLOW §7: year 1–2 → 2, otherwise 3; +1 when targeting a senior role. */
export function startingDifficulty(year: number, targetRole: string): number {
  const base = year <= 2 ? 2 : 3;
  return /\b(senior|lead|staff|sde ?(2|ii))\b/i.test(targetRole) ? base + 1 : base;
}
