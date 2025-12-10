import { Module, forwardRef } from '@nestjs/common';
import { GameHistoryController } from './game-history.controller';
import { GameHistoryService } from './game-history.service';
import { DatabaseModule } from '../database/database.module';
import { ProfileModule } from '../profile/profile.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => ProfileModule)],
  controllers: [GameHistoryController],
  providers: [GameHistoryService],
  exports: [GameHistoryService],
})
export class GameHistoryModule {}
