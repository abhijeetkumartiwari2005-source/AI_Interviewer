// generateJSON: one call site for every LLM request.
// Providers: an OpenAI-compatible API (Groq by default) and Gemini models (GEMINI_MODELS, in order);
// LLM_PRIMARY picks which family goes first. Each provider gets a timeout and one "repair" retry
// if the JSON is invalid.
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import OpenAI from 'openai';
import { z } from 'zod';
import { config } from '../config.js';

export class LLMUnavailableError extends Error {
  constructor(public readonly attempts: string[]) {
    super(`All LLM providers failed: ${attempts.join(' | ')}`);
  }
}

interface Provider {
  name: string;
  complete(system: string, user: string, jsonSchema: object, signal: AbortSignal): Promise<string>;
}

const gemini = config.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }) : null;

const geminiProviders: Provider[] = (gemini ? config.GEMINI_MODELS : []).map((model) => ({
  name: model,
  async complete(system, user, jsonSchema, signal) {
    const res = await gemini!.models.generateContent({
      model,
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
        temperature: 0.4,
        // Gemini 3 uses thinkingLevel (thinkingBudget is rejected). LOW keeps a live voice turn fast.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: signal,
      },
    });
    return res.text ?? '';
  },
}));

const compatProvider: Provider | null = config.OPENAI_COMPAT_API_KEY
  ? (() => {
      const client = new OpenAI({ apiKey: config.OPENAI_COMPAT_API_KEY, baseURL: config.OPENAI_COMPAT_BASE_URL, maxRetries: 0 });
      return {
        name: `${new URL(config.OPENAI_COMPAT_BASE_URL).hostname}:${config.OPENAI_COMPAT_MODEL}`,
        async complete(system, user, jsonSchema, signal) {
          const res = await client.chat.completions.create(
            {
              model: config.OPENAI_COMPAT_MODEL,
              temperature: 0.4,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: `${system}\n\nRespond with JSON matching this JSON Schema:\n${JSON.stringify(jsonSchema)}` },
                { role: 'user', content: user },
              ],
            },
            { signal },
          );
          return res.choices[0]?.message?.content ?? '';
        },
      } satisfies Provider;
    })()
  : null;

const compatProviders = compatProvider ? [compatProvider] : [];
const providers: Provider[] =
  config.LLM_PRIMARY === 'gemini' ? [...geminiProviders, ...compatProviders] : [...compatProviders, ...geminiProviders];

export const llmInfo = { chain: providers.map((p) => p.name) };

// Circuit breaker: a provider that just failed (503 / timeout / network) is skipped for a while,
// so one overloaded model doesn't add its full timeout to every turn of a live interview.
const COOLDOWN_MS = 60_000;
const cooldownUntil = new Map<string, number>();
const isCoolingDown = (p: Provider) => (cooldownUntil.get(p.name) ?? 0) > Date.now();

/** Healthy providers first (in configured order), then cooling-down ones as a last resort. */
function providerOrder(): Provider[] {
  return [...providers.filter((p) => !isCoolingDown(p)), ...providers.filter(isCoolingDown)];
}

function parseJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned);
}

function toJsonSchema(schema: z.ZodType): object {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

export async function generateJSON<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  label: string;
  timeoutMs?: number; // per provider attempt; defaults to LLM_TIMEOUT_MS
}): Promise<{ data: T; provider: string }> {
  const jsonSchema = toJsonSchema(opts.schema);
  const attempts: string[] = [];

  for (const provider of providerOrder()) {
    let user = opts.prompt;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const started = Date.now();
      let raw: string;
      try {
        raw = await provider.complete(opts.system, user, jsonSchema, AbortSignal.timeout(opts.timeoutMs ?? config.LLM_TIMEOUT_MS));
      } catch (err) {
        // Network error / timeout / 429 / 5xx: no point repairing, move to the next provider.
        const reason = (err as Error).message.slice(0, 200);
        attempts.push(`${provider.name}: ${reason}`);
        cooldownUntil.set(provider.name, Date.now() + COOLDOWN_MS);
        console.warn(`[llm] ${opts.label} ${provider.name} failed after ${Date.now() - started}ms, cooling down: ${reason}`);
        break;
      }
      cooldownUntil.delete(provider.name);

      let problem: string;
      try {
        const parsed = opts.schema.safeParse(parseJson(raw));
        if (parsed.success) {
          console.log(`[llm] ${opts.label} ok via ${provider.name} in ${Date.now() - started}ms`);
          return { data: parsed.data, provider: provider.name };
        }
        problem = z.prettifyError(parsed.error);
      } catch {
        problem = 'Response was not valid JSON.';
      }

      attempts.push(`${provider.name} attempt ${attempt}: invalid output`);
      console.warn(`[llm] ${opts.label} invalid output from ${provider.name}: ${problem.slice(0, 300)}`);
      user = `${opts.prompt}\n\nYour previous response was invalid:\n${problem}\nReturn ONLY valid JSON matching the schema. No prose, no markdown.`;
    }
  }

  throw new LLMUnavailableError(attempts);
}
