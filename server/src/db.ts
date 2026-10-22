import mongoose, { Schema } from 'mongoose';
import { config } from './config.js';
import type { InterviewState } from './schemas.js';

// Shapes are validated with Zod at the API boundary and in the engine,
// so nested fields are stored as Mixed rather than duplicated as Mongoose schemas.
const interviewSchema = new Schema(
  {
    profile: { type: Schema.Types.Mixed, required: true },
    interviewType: { type: String, required: true },
    status: { type: String, enum: ['active', 'completed'], default: 'active', index: true },
    plan: { type: [String], required: true },
    mainIndex: { type: Number, default: 0 },
    difficulty: { type: Number, required: true },
    currentQuestion: { type: Schema.Types.Mixed, default: null },
    turns: { type: [Schema.Types.Mixed], default: [] },
    memory: { type: Schema.Types.Mixed, default: () => ({ summary: '', strengths: [], weaknesses: [], probedClaims: [] }) },
    skillEstimate: { type: Schema.Types.Mixed, default: () => ({}) },
    followUpsAsked: { type: Number, default: 0 },
    consecutiveHigh: { type: Number, default: 0 },
    pendingQuestionId: { type: String, default: null }, // lock against double submits
    endedEarly: { type: Boolean }, // set by /end; unset on sessions ended before it was recorded
    report: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, minimize: false },
);

export const InterviewModel = mongoose.model('Interview', interviewSchema);

let connecting: Promise<void> | null = null;

/** Connects once and reuses the connection; a failed attempt is retried on the next call. */
export function connectDb(): Promise<void> {
  connecting ??= mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000 }).then(() => {
    console.log(`[db] connected to ${mongoose.connection.name}`);
  });
  connecting.catch(() => {
    connecting = null;
  });
  return connecting;
}

export const isDbConnected = () => mongoose.connection.readyState === 1;

export function toState(doc: Record<string, unknown>): InterviewState {
  return { ...(doc as unknown as InterviewState), _id: String(doc._id) };
}
