import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { DatabaseModule } from '../database/database.module';
import { AdminGuard } from '../auth/admin.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AdminGuard],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
