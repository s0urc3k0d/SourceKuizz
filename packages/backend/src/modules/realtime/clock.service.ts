import { Injectable } from '@nestjs/common';

@Injectable()
export class ClockService {
  private scale: number;
  constructor() {
    const raw = process.env.TIME_SCALE;
    const n = raw ? Number(raw) : 1;
    this.scale = isFinite(n) && n > 0 ? n : 1;
  }
  now(): number { return Date.now(); }
  setTimeout(fn: (...args: any[]) => void, ms: number) {
    const scaled = ms * this.scale;
    return setTimeout(fn, scaled);
  }
  clearTimeout(handle: any) { clearTimeout(handle); }
}

