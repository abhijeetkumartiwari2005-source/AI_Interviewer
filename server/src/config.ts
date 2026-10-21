import 'dotenv/config';
import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const splitList = (s: string) => s.split(',').map((m) => m.trim()).filter(Boolean);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  // Reverse-proxy hops in front of the server (Render: 1). Without it every request looks like it
  // comes from the proxy, so the per-IP rate limit would be shared by all users.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required (Atlas connection string)'),

  // Which provider family is tried first; the other one is the backup.
  // Groq answers a turn in ~2s; Gemini's free tier is slower and often over quota.
  LLM_PRIMARY: z.enum(['openai_compat', 'gemini']).default('openai_compat'),

  // Any OpenAI-compatible API: Groq by default, xAI etc. also work.
  OPENAI_COMPAT_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENAI_COMPAT_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  // Tried in order. Groq rate-limits each model separately, so chaining models multiplies free-tier throughput.
  OPENAI_COMPAT_MODELS: z.string().default('qwen/qwen3.8-27b,openai/gpt-oss-120b,openai/gpt-oss-20b').transform(splitList),

  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  // Tried in order; free-tier models hit 503 "high demand" often, so chain a lighter one.
  GEMINI_MODELS: z.string().default('gemini-3.5-flash-lite,gemini-3.8-flash').transform(splitList),

  // Per provider attempt. Groq replies in ~2s, but Gemini flash-lite can take 10-15s as the backup.
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  // The report prompt carries the whole interview and isn't on the live voice path, so it gets longer.
  LLM_REPORT_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

const parsed = EnvSchema.refine((env) => env.OPENAI_COMPAT_API_KEY || env.GEMINI_API_KEY, {
  message: 'Set at least one LLM key: OPENAI_COMPAT_API_KEY (Groq) or GEMINI_API_KEY',
  path: ['OPENAI_COMPAT_API_KEY'],
}).safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const config = parsed.data;
