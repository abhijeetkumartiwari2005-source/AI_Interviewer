import { describe, expect, it } from 'vitest';
import { findEvidence } from '../src/modules/evidence.js';

const TRANSCRIPTS = [
  'Hi, I am a final year CSE student and I built a placement portal.',
  'So basically we used Redis to cache the job listings because the Postgres queries were slow under load.',
];

describe('findEvidence', () => {
  it('finds an exact quote and returns the original words and turn', () => {
    const m = findEvidence('we used Redis to cache the job listings', TRANSCRIPTS);
    expect(m).toMatchObject({ quote: 'we used Redis to cache the job listings', turnIndex: 1, ratio: 1 });
  });

  it('ignores case and punctuation', () => {
    expect(findEvidence('WE USED REDIS, to cache the job-listings', TRANSCRIPTS)?.turnIndex).toBe(1);
  });

  it('tolerates a dropped word and returns the candidate’s own wording', () => {
    const m = findEvidence('we used Redis to cache job listings because the Postgres queries were slow', TRANSCRIPTS);
    expect(m?.ratio).toBeGreaterThanOrEqual(0.85);
    expect(m?.quote).toBe('we used Redis to cache the job listings because the Postgres queries were slow');
  });

  it('rejects a paraphrase', () => {
    expect(findEvidence('we added a caching layer with Redis for listing queries', TRANSCRIPTS)).toBeNull();
  });

  it('requires short quotes to match exactly', () => {
    expect(findEvidence('placement portal', TRANSCRIPTS)?.turnIndex).toBe(0);
    expect(findEvidence('portal placement', TRANSCRIPTS)).toBeNull();
  });

  it('returns null for an empty quote', () => {
    expect(findEvidence('', TRANSCRIPTS)).toBeNull();
    expect(findEvidence(' — ', TRANSCRIPTS)).toBeNull();
  });
});
