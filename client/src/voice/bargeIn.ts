// Echo check for voice barge-in. While a panelist speaks, the mic also hears the panelist's own
// voice (speakers, no headphones). Only treat it as the candidate interrupting when the most recent
// words heard are mostly words that aren't in the line being spoken.

const WINDOW = 6; // judge only the latest words, so a long echo can't dilute real speech
const MIN_NOVEL = 3;
const MIN_NOVEL_SHARE = 0.6;

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9']/g, ''))
    .filter(Boolean);

export function isBargeIn(heard: string, spoken: string): boolean {
  const recent = words(heard).slice(-WINDOW);
  if (recent.length < MIN_NOVEL) return false;
  const spokenWords = new Set(words(spoken));
  const novel = recent.filter((w) => !spokenWords.has(w)).length;
  return novel >= MIN_NOVEL && novel / recent.length >= MIN_NOVEL_SHARE;
}
