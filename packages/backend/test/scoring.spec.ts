import { describe, it, expect } from 'vitest';
import { ScoringService } from '../src/modules/scoring/scoring.service';

describe('ScoringService', () => {
  const svc = new ScoringService();

  it('returns 0 when not correct', () => {
    expect(
      svc.computeScore({
        correct: false,
        timeMs: 1000,
        limitMs: 5000,
        streak: 0,
      }),
    ).toBe(0);
  });

  it('rewards speed & streak', () => {
    const s1 = svc.computeScore({ correct: true, timeMs: 1000, limitMs: 5000, streak: 0 });
    const s2 = svc.computeScore({ correct: true, timeMs: 500, limitMs: 5000, streak: 5 });
    expect(s2).toBeGreaterThan(s1);
  });
});
