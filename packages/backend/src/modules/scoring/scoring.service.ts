import { Injectable } from '@nestjs/common';

export interface ComputeScoreParams {
  correct: boolean;
  timeMs: number;
  limitMs: number;
  streak: number;
}

@Injectable()
export class ScoringService {
  computeScore({ correct, timeMs, limitMs, streak }: ComputeScoreParams): number {
    if (!correct) return 0;
    const speedFactor = Math.max(0, 1 - timeMs / limitMs); // 0..1
    const base = 100;
    const streakBonus = 15 * Math.min(streak, 10);
    return Math.round(base + base * 0.5 * speedFactor + streakBonus);
  }
}
