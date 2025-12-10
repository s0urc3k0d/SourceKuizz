import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { ScoringModule } from './scoring/scoring.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { QuizModule } from './quiz/quiz.module';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { ProfileModule } from './profile/profile.module';
import { GameHistoryModule } from './history/game-history.module';
import { NotificationModule } from './notifications/notification.module';
import { GamificationModule } from './gamification/gamification.module';
import { ApiModule } from './api/api.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { TwitchBotModule } from './twitch-bot/twitch-bot.module';
import { RequestContextMiddleware } from '../middleware/request-context.middleware';

@Module({
  imports: [
    CommonModule,
    DatabaseModule,
    HealthModule,
    ScoringModule,
    RealtimeModule,
    UsersModule,
    AuthModule,
    QuizModule,
    ProfileModule,
    GameHistoryModule,
    NotificationModule,
    GamificationModule,
    ApiModule,
    AnalyticsModule,
    TwitchBotModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware as any).forRoutes('*');
  }
}
