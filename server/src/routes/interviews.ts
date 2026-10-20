import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AnswerBody, CreateInterviewBody } from '../schemas.js';
import { createInterview, endInterview, getInterview, submitAnswer } from '../modules/interviewEngine.js';
import { getReport } from '../modules/report.js';

export const interviewsRouter = Router();

const answerLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many answers, slow down' } },
});

interviewsRouter.post('/', async (req, res) => {
  const { profile, interviewType } = CreateInterviewBody.parse(req.body);
  res.status(201).json(await createInterview(profile, interviewType));
});

interviewsRouter.get('/:id', async (req, res) => {
  res.json(await getInterview(req.params.id));
});

interviewsRouter.post('/:id/answer', answerLimiter, async (req, res) => {
  res.json(await submitAnswer(String(req.params.id), AnswerBody.parse(req.body)));
});

interviewsRouter.post('/:id/end', async (req, res) => {
  res.json(await endInterview(req.params.id));
});

interviewsRouter.get('/:id/report', async (req, res) => {
  res.json(await getReport(req.params.id));
});
