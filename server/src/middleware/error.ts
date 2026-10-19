import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, z } from 'zod';

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'INTERVIEW_COMPLETED'
  | 'STALE_QUESTION'
  | 'LLM_UNAVAILABLE'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (req, _res, next) =>
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: z.prettifyError(err) } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'Malformed JSON body' } });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
