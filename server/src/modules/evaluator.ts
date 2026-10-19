// Runs the single per-turn LLM call and cleans up its output.
import { TurnSchema, type InterviewState, type TurnResult } from '../schemas.js';
import { generateJSON, LLMUnavailableError } from './llm.js';
import { buildTurnPrompt, SYSTEM_PROMPT } from './promptBuilder.js';

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export async function evaluateTurn(
  state: InterviewState,
  transcript: string,
  durationSec: number,
): Promise<{ result: TurnResult; provider: string } | null> {
  try {
    const { data, provider } = await generateJSON({
      system: SYSTEM_PROMPT,
      prompt: buildTurnPrompt(state, transcript, durationSec),
      schema: TurnSchema,
      label: `turn ${state.turns.length + 1}`,
    });

    // Evidence must actually appear in what the student said; otherwise drop it.
    const quote = normalise(data.evidenceQuote);
    if (quote && !normalise(transcript).includes(quote)) data.evidenceQuote = '';

    // Don't re-probe claims we already followed up on.
    const probed = new Set(state.memory.probedClaims.map(normalise));
    data.claimsToProbe = data.claimsToProbe.filter((c) => !probed.has(normalise(c)));

    return { result: data, provider };
  } catch (err) {
    if (err instanceof LLMUnavailableError) {
      console.error(`[evaluator] degraded path: ${err.message}`);
      return null;
    }
    throw err;
  }
}
