import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { ScoringModule } from './scoring/scoring.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { QuizModule } from './quiz/quiz.module';
import { DatabaseModule } from './database/database.module';
import { RequestContextMiddleware } from '../middleware/request-context.middleware';

@Module({
  imports: [DatabaseModule, HealthModule, ScoringModule, RealtimeModule, UsersModule, AuthModule, QuizModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware as any).forRoutes('*');
  }
}
