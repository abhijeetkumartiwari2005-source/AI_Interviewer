import { describe, expect, it } from 'vitest';
import { getBranchPack, sampleProfiles } from '../src/catalog.js';
import { ProfileSchema } from '../src/schemas.js';

describe('getBranchPack', () => {
  it.each([
    ['Production Engineering', 'production'],
    ['PRODUCTION', 'production'],
    ['Production and Industrial Engineering', 'production'],
    ['Industrial & Production Engg', 'production'],
    ['Manufacturing Engineering', 'production'],
    ['PIE', 'production'],
    ['Computer Science', 'cse'],
    ['Computer Science and Engineering', 'cse'],
    ['CSE', 'cse'],
  ])('maps "%s" to the %s pack', (branch, key) => {
    expect(getBranchPack(branch).key).toBe(key);
  });

  it('falls back to the generic pack for other branches', () => {
    for (const branch of ['Civil Engineering', 'Mechanical Engineering', 'Pipeline Engineering', 'Chemical']) {
      expect(getBranchPack(branch).key).toBe('generic');
    }
  });
});

describe('sample profiles', () => {
  it('ship a CSE and a Production student, both valid and matched to their own pack', () => {
    expect(sampleProfiles.map((s) => s.key)).toEqual(['cse', 'production']);
    for (const sample of sampleProfiles) {
      expect(ProfileSchema.safeParse(sample.profile).success).toBe(true);
      expect(getBranchPack(sample.profile.branch).key).toBe(sample.key);
    }
  });
});
