import { Module, OnModuleInit, Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { ScoringModule } from '../scoring/scoring.module';
import { DatabaseModule } from '../database/database.module';
import { ClockService } from './clock.service';
import { MetricsService } from './metrics.service';
import { LeaderboardController } from './leaderboard.controller';

@Injectable()
class RealtimeMetricsGaugesInitializer implements OnModuleInit {
  constructor(private readonly metrics: MetricsService) {}
  onModuleInit() {
    // Enregistrer les métriques de type gauge ici pour qu'elles aient le bon TYPE dans l'exposition.
    this.metrics.registerGauge('players.active');
    this.metrics.registerGauge('sessions.active');
    // Compteurs / histograms simplement utilisés plus tard (pas besoin d'init mais on documente)
    // question.duration_seconds & session.duration_seconds sont des histograms dynamiques
    // player.reconnect est un compteur incrémenté sur reconnexion
  }
}

@Module({
  imports: [ScoringModule, DatabaseModule],
  providers: [RealtimeGateway, ClockService, MetricsService, RealtimeMetricsGaugesInitializer],
  exports: [MetricsService],
  controllers: [LeaderboardController],
})
export class RealtimeModule {}
