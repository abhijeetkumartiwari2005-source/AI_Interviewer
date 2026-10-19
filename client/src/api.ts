import type {
  AnswerResponse,
  CreateResponse,
  Delivery,
  EndResponse,
  InterviewType,
  Profile,
  SampleProfile,
  SessionState,
} from './types';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  readonly status: number; // 0 = network failure
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your connection.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'UNKNOWN', data?.error?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

/** Retries network / 5xx / 429 failures with backoff (FLOW §5: 1s, 3s). */
export async function withRetry<T>(fn: () => Promise<T>, delaysMs = [1000, 3000]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = delaysMs[attempt];
      if (!(err instanceof ApiError) || !err.retryable || delay === undefined) throw err;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export const api = {
  sampleProfiles: () => request<SampleProfile[]>('GET', '/sample-profiles'),
  create: (profile: Profile, interviewType: InterviewType) =>
    request<CreateResponse>('POST', '/interviews', { profile, interviewType }),
  get: (id: string) => request<SessionState>('GET', `/interviews/${id}`),
  answer: (id: string, body: { questionId: string; transcript: string; durationSec: number; delivery?: Delivery }) =>
    request<AnswerResponse>('POST', `/interviews/${id}/answer`, body),
  end: (id: string) => request<EndResponse>('POST', `/interviews/${id}/end`, {}),
};
