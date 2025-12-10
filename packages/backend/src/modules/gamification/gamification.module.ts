import { Module, forwardRef } from '@nestjs/common';
import { BadgeService } from './badge.service';
import { XPService } from './xp.service';
import { StreakService } from './streak.service';
import { GamificationController } from './gamification.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [GamificationController],
  providers: [BadgeService, XPService, StreakService],
  exports: [BadgeService, XPService, StreakService],
})
export class GamificationModule {}
