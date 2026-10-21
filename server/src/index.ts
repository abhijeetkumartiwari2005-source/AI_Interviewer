import cors from 'cors';
import express from 'express';
import { sampleProfiles } from './catalog.js';
import { config } from './config.js';
import { connectDb, isDbConnected } from './db.js';
import { errorHandler, notFound } from './middleware/error.js';
import { llmInfo } from './modules/llm.js';
import { interviewsRouter } from './routes/interviews.js';

const app = express();
app.set('trust proxy', config.TRUST_PROXY);
app.use(cors({ origin: config.CLIENT_ORIGIN }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: isDbConnected(), db: isDbConnected() ? 'connected' : 'disconnected', llm: llmInfo });
});

app.get('/api/sample-profiles', (_req, res) => {
  res.json(sampleProfiles);
});

app.use('/api/interviews', interviewsRouter);
app.use(notFound);
app.use(errorHandler);

await connectDb();
app.listen(config.PORT, () => console.log(`[server] listening on http://localhost:${config.PORT}`));
