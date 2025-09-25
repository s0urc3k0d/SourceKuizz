import { Controller, Get, Header, Post, UnauthorizedException } from '@nestjs/common';
import { MetricsService } from '../realtime/metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private metrics: MetricsService) {}

  @Get()
  getMetrics() {
    return { counters: this.metrics.snapshot() };
  }

  @Get('prom')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  getPrometheus() {
    return this.metrics.toPrometheus();
  }

  @Post('reset')
  resetAll() {
    const tokenEnv = process.env.METRICS_RESET_TOKEN;
    if (!tokenEnv) {
      this.metrics.resetAll();
      return { reset: true, protected: false };
    }
    const req: any = (global as any).__lastHttpRequest;
    const headerToken = (req?.headers?.['x-metrics-reset-token'] || req?.headers?.['x-metrics-token'] || '') as string;
    const authHeader = (req?.headers?.['authorization'] || '') as string;
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const provided = headerToken || bearer;
    if (!provided || provided !== tokenEnv) throw new UnauthorizedException('reset_protected');
    this.metrics.resetAll();
    return { reset: true, protected: true };
  }
}
