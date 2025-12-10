import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface RecordGameDto {
  userId: string;
  sessionCode: string;
  quizId: string;
  quizTitle: string;
  score: number;
  rank: number;
  totalPlayers: number;
  correctCount: number;
  totalQuestions: number;
  avgTimeMs?: number;
}

export interface GameHistoryFilters {
  limit?: number;
  offset?: number;
  sortBy?: 'playedAt' | 'score' | 'rank';
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class GameHistoryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Enregistre une partie dans l'historique
   */
  async recordGame(dto: RecordGameDto) {
    return this.prisma.gameHistory.create({
      data: {
        userId: dto.userId,
        sessionCode: dto.sessionCode,
        quizId: dto.quizId,
        quizTitle: dto.quizTitle,
        score: dto.score,
        rank: dto.rank,
        totalPlayers: dto.totalPlayers,
        correctCount: dto.correctCount,
        totalQuestions: dto.totalQuestions,
        avgTimeMs: dto.avgTimeMs ?? null,
      },
    });
  }

  /**
   * Récupère l'historique d'un utilisateur
   */
  async getUserHistory(userId: string, filters: GameHistoryFilters = {}) {
    const { limit = 20, offset = 0, sortBy = 'playedAt', sortOrder = 'desc' } = filters;

    const [items, total] = await Promise.all([
      this.prisma.gameHistory.findMany({
        where: { userId },
        orderBy: { [sortBy]: sortOrder },
        take: limit,
        skip: offset,
      }),
      this.prisma.gameHistory.count({ where: { userId } }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Récupère les détails d'une partie
   */
  async getGameDetail(historyId: string) {
    return this.prisma.gameHistory.findUnique({
      where: { id: historyId },
    });
  }

  /**
   * Supprime une entrée de l'historique
   */
  async deleteHistoryEntry(historyId: string, userId: string) {
    return this.prisma.gameHistory.deleteMany({
      where: { id: historyId, userId },
    });
  }

  /**
   * Récupère le nombre de parties jouées ce jour
   */
  async getTodayGamesCount(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.gameHistory.count({
      where: {
        userId,
        playedAt: { gte: today },
      },
    });
  }

  /**
   * Récupère l'historique récent pour le profil
   */
  async getRecentGames(userId: string, limit = 5) {
    return this.prisma.gameHistory.findMany({
      where: { userId },
      orderBy: { playedAt: 'desc' },
      take: limit,
    });
  }
}
