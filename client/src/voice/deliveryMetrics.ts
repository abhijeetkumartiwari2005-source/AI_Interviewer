// Delivery metrics for the "confidence & vocal delivery" competency (FLOW §8).
// Deliberately excludes anything accent-related (pronunciation, STT confidence).
import type { Delivery } from '../types';
import type { Snapshot } from './useSpeechRecognition';

// Conservative list: words like "like" / "actually" are often used legitimately, so they're not counted.
const FILLERS = /\b(um+|uh+|erm+|hmm+|you know|i mean|basically)\b/gi;

export function computeDelivery(snap: Snapshot, endedAt = Date.now()): Delivery {
  const words = snap.text ? snap.text.split(/\s+/).length : 0;
  const speakingMs = snap.firstSpeechAt && snap.lastActivityAt ? snap.lastActivityAt - snap.firstSpeechAt : 0;
  // Very short answers make WPM meaningless; floor the window at 5s.
  const wpm = words ? words / (Math.max(speakingMs, 5000) / 60000) : 0;
  const fillers = snap.text.match(FILLERS)?.length ?? 0;
  const latencyMs = (snap.firstSpeechAt ?? endedAt) - snap.startedAt;

  return {
    wpm: Math.round(Math.min(wpm, 500)),
    fillerRate: words ? Math.round((fillers / words) * 1000) / 1000 : 0,
    longestPauseSec: Math.round(Math.min(snap.longestGapMs / 1000, 600) * 10) / 10,
    latencySec: Math.round(Math.min(Math.max(latencyMs, 0) / 1000, 600) * 10) / 10,
  };
}
