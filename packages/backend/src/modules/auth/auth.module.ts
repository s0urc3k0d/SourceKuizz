import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TwitchService } from './twitch.service';
import { TwitchController } from './twitch.controller';
import { UsersModule } from '../users/users.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    UsersModule,
    DatabaseModule,
    JwtModule.register({
      global: true,
      signOptions: { expiresIn: '15m' },
      secret: process.env.JWT_PRIVATE_KEY || 'dev_secret',
    }),
  ],
  controllers: [AuthController, TwitchController],
  providers: [AuthService, TwitchService],
  exports: [AuthService, TwitchService],
})
export class AuthModule {}
