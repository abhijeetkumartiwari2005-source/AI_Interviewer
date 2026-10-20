// Ties LLM-cited quotes back to what the candidate actually said (FLOW §9: fuzzy match ≥ 0.85).
// Word-level and order-tolerant so a dropped filler or an STT slip doesn't lose real evidence,
// and the returned quote is always the candidate's own words, not the LLM's paraphrase.

const normWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

export const MATCH_THRESHOLD = 0.85;
const EXACT_BELOW_WORDS = 4; // short quotes are too easy to match loosely

export interface EvidenceMatch {
  quote: string; // verbatim excerpt from the transcript
  turnIndex: number;
  ratio: number;
}

function overlap(a: string[], b: string[]): number {
  const counts = new Map<string, number>();
  for (const w of a) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of b) {
    const n = counts.get(w);
    if (n) {
      shared += 1;
      counts.set(w, n - 1);
    }
  }
  return shared;
}

export function findEvidence(quote: string, transcripts: string[], threshold = MATCH_THRESHOLD): EvidenceMatch | null {
  const q = quote.split(/\s+/).map(normWord).filter(Boolean);
  if (!q.length) return null;
  const exactOnly = q.length < EXACT_BELOW_WORDS;
  const windowSizes = exactOnly ? [q.length] : [q.length, q.length - 1, q.length + 1];

  let best: EvidenceMatch | null = null;
  transcripts.forEach((text, turnIndex) => {
    const raw = text.split(/\s+/).filter((w) => normWord(w));
    const words = raw.map(normWord);
    for (const size of windowSizes) {
      for (let start = 0; start + size <= words.length; start++) {
        const window = words.slice(start, start + size);
        const ratio = exactOnly
          ? Number(window.every((w, i) => w === q[i]))
          : overlap(q, window) / Math.max(q.length, size);
        if (ratio >= threshold && (!best || ratio > best.ratio)) {
          best = { quote: raw.slice(start, start + size).join(' '), turnIndex, ratio };
        }
      }
    }
  });
  return best;
}
