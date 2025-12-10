import { Module } from '@nestjs/common';
import { TwitchBotService } from './twitch-bot.service';
import { TwitchBotController } from './twitch-bot.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TwitchBotController],
  providers: [TwitchBotService],
  exports: [TwitchBotService],
})
export class TwitchBotModule {}
