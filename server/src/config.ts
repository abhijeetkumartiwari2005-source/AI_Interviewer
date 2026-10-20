import 'dotenv/config';
import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required (Atlas connection string)'),

  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  // Tried in order; free-tier models hit 503 "high demand" often, so chain a lighter one.
  GEMINI_MODELS: z.string().default('gemini-3.8-flash,gemini-3.5-flash-lite').transform((s) => s.split(',').map((m) => m.trim()).filter(Boolean)),

  FALLBACK_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  FALLBACK_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  FALLBACK_MODEL: z.string().default('llama-3.3-70b-versatile'),

  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(10000), // per provider attempt
  // The report prompt carries the whole interview and isn't on the live voice path, so it gets longer.
  LLM_REPORT_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const config = parsed.data;
