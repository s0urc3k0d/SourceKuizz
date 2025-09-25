import { Module } from '@nestjs/common';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { UsersModule } from '../../src/modules/users/users.module';
import { QuizModule } from '../../src/modules/quiz/quiz.module';
import { DatabaseModule } from '../../src/modules/database/database.module';

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule, QuizModule],
})
export class TestAppModule {}
