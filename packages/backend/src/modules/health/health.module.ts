import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { RootController } from './root.controller';

@Module({
  imports: [RealtimeModule],
  controllers: [HealthController, MetricsController, RootController],
})
export class HealthModule {}
