import { describe, expect, it } from 'vitest';
import { isBargeIn } from './bargeIn';

const QUESTION = 'In your placement portal, why did you choose MongoDB over a relational database for storing applications?';

describe('isBargeIn', () => {
  it('ignores a clean echo of the question', () => {
    expect(isBargeIn('in your placement portal why did you choose mongodb over a', QUESTION)).toBe(false);
  });

  it('ignores an echo with typical recognition slips', () => {
    expect(isBargeIn('why did you choose mongo db over a relational data base for storing', QUESTION)).toBe(false);
  });

  it('detects the candidate talking over the question', () => {
    expect(isBargeIn('so basically our data was deeply nested', QUESTION)).toBe(true);
  });

  it('detects the candidate even after a long echo', () => {
    expect(isBargeIn(`${QUESTION} sorry I already know this one`, QUESTION)).toBe(true);
  });

  it('counts the candidate reusing a few question words as speech when most words are new', () => {
    expect(isBargeIn('mongodb because each student profile was nested', QUESTION)).toBe(true);
  });

  it('needs at least three new words, so a cough or "um" does not interrupt', () => {
    expect(isBargeIn('um', QUESTION)).toBe(false);
    expect(isBargeIn('uh okay', QUESTION)).toBe(false);
  });

  it('ignores case and punctuation', () => {
    expect(isBargeIn('Why did you choose MongoDB, over a relational database?', QUESTION)).toBe(false);
  });
});
