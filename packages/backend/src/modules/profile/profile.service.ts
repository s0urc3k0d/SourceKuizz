import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface UpdateProfileDto {
  displayName?: string;
  bio?: string;
  customAvatarUrl?: string;
  bannerColor?: string;
  showStats?: boolean;
  showHistory?: boolean;
}

export interface UserStats {
  totalGames: number;
  totalScore: number;
  averageRank: number;
  bestRank: number;
  winCount: number;
  correctRate: number;
  averageTimeMs: number | null;
}

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  /**
   * Récupère ou crée le profil d'un utilisateur
   */
  async getOrCreateProfile(userId: string) {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });

    if (existing) return existing;

    // Créer le profil par défaut
    return this.prisma.userProfile.create({
      data: { userId },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
  }

  /**
   * Met à jour le profil utilisateur
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // S'assurer que le profil existe
    await this.getOrCreateProfile(userId);

    return this.prisma.userProfile.update({
      where: { userId },
      data: {
        displayName: dto.displayName,
        bio: dto.bio,
        customAvatarUrl: dto.customAvatarUrl,
        bannerColor: dto.bannerColor,
        showStats: dto.showStats,
        showHistory: dto.showHistory,
      },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
  }

  /**
   * Récupère le profil public d'un utilisateur
   */
  async getPublicProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });

    if (!profile) {
      // Tenter de récupérer l'utilisateur sans profil
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, avatarUrl: true },
      });
      if (!user) throw new NotFoundException('Utilisateur non trouvé');
      // Retourner un profil minimal
      return {
        user,
        displayName: null,
        bio: null,
        customAvatarUrl: null,
        bannerColor: '#6366f1',
        showStats: true,
        showHistory: true,
      };
    }

    return profile;
  }

  /**
   * Calcule les statistiques d'un utilisateur
   */
  async getUserStats(userId: string): Promise<UserStats> {
    const history = await this.prisma.gameHistory.findMany({
      where: { userId },
    });

    if (history.length === 0) {
      return {
        totalGames: 0,
        totalScore: 0,
        averageRank: 0,
        bestRank: 0,
        winCount: 0,
        correctRate: 0,
        averageTimeMs: null,
      };
    }

    type HistoryItem = typeof history[number];

    const totalGames = history.length;
    const totalScore = history.reduce((sum: number, h: HistoryItem) => sum + h.score, 0);
    const averageRank = history.reduce((sum: number, h: HistoryItem) => sum + h.rank, 0) / totalGames;
    const bestRank = Math.min(...history.map((h: HistoryItem) => h.rank));
    const winCount = history.filter((h: HistoryItem) => h.rank === 1).length;

    const totalCorrect = history.reduce((sum: number, h: HistoryItem) => sum + h.correctCount, 0);
    const totalQuestions = history.reduce((sum: number, h: HistoryItem) => sum + h.totalQuestions, 0);
    const correctRate = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;

    const timesMs = history.filter((h: HistoryItem) => h.avgTimeMs !== null).map((h: HistoryItem) => h.avgTimeMs!);
    const averageTimeMs = timesMs.length > 0 ? Math.round(timesMs.reduce((a: number, b: number) => a + b, 0) / timesMs.length) : null;

    return {
      totalGames,
      totalScore,
      averageRank: Math.round(averageRank * 100) / 100,
      bestRank,
      winCount,
      correctRate: Math.round(correctRate * 1000) / 1000,
      averageTimeMs,
    };
  }
}
