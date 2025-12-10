import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Met à jour le streak d'un utilisateur après une partie
   * Un streak est maintenu si l'utilisateur joue au moins une partie par jour
   */
  async updateStreak(userId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    streakMaintained: boolean;
    newRecord: boolean;
  }> {
    const today = this.getDateOnly(new Date());
    
    const existingStreak = await this.prisma.userStreak.findUnique({
      where: { userId },
    });

    if (!existingStreak) {
      // Premier jour de streak
      const newStreak = await this.prisma.userStreak.create({
        data: {
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastPlayedAt: today,
        },
      });

      this.logger.log(`Nouveau streak créé pour l'utilisateur ${userId}`);

      return {
        currentStreak: newStreak.currentStreak,
        longestStreak: newStreak.longestStreak,
        streakMaintained: true,
        newRecord: true,
      };
    }

    // Si lastPlayedAt est null, on traite comme si c'était un nouveau streak
    if (!existingStreak.lastPlayedAt) {
      await this.prisma.userStreak.update({
        where: { userId },
        data: {
          currentStreak: 1,
          longestStreak: Math.max(existingStreak.longestStreak, 1),
          lastPlayedAt: today,
        },
      });
      return {
        currentStreak: 1,
        longestStreak: Math.max(existingStreak.longestStreak, 1),
        streakMaintained: true,
        newRecord: existingStreak.longestStreak === 0,
      };
    }

    const lastPlayed = this.getDateOnly(existingStreak.lastPlayedAt);
    const daysDiff = this.daysBetween(lastPlayed, today);

    if (daysDiff === 0) {
      // Déjà joué aujourd'hui, pas de changement
      return {
        currentStreak: existingStreak.currentStreak,
        longestStreak: existingStreak.longestStreak,
        streakMaintained: true,
        newRecord: false,
      };
    }

    if (daysDiff === 1) {
      // Jour consécutif - streak continue
      const newCurrentStreak = existingStreak.currentStreak + 1;
      const newLongestStreak = Math.max(existingStreak.longestStreak, newCurrentStreak);
      const newRecord = newCurrentStreak > existingStreak.longestStreak;

      await this.prisma.userStreak.update({
        where: { userId },
        data: {
          currentStreak: newCurrentStreak,
          longestStreak: newLongestStreak,
          lastPlayedAt: today,
        },
      });

      this.logger.log(`Streak mis à jour pour ${userId}: ${newCurrentStreak} jours`);

      return {
        currentStreak: newCurrentStreak,
        longestStreak: newLongestStreak,
        streakMaintained: true,
        newRecord,
      };
    }

    // Streak cassé (plus d'un jour sans jouer)
    const updatedStreak = await this.prisma.userStreak.update({
      where: { userId },
      data: {
        currentStreak: 1, // Recommence à 1
        lastPlayedAt: today,
      },
    });

    this.logger.log(`Streak cassé pour ${userId}, recommence à 1`);

    return {
      currentStreak: 1,
      longestStreak: updatedStreak.longestStreak,
      streakMaintained: false,
      newRecord: false,
    };
  }

  /**
   * Récupère les informations de streak d'un utilisateur
   */
  async getCurrentStreak(userId: string): Promise<{
    currentStreak: number;
    longestStreak: number;
    lastPlayedAt: Date | null;
    isActiveToday: boolean;
    willExpireIn: number | null; // heures restantes avant expiration
  }> {
    const streak = await this.prisma.userStreak.findUnique({
      where: { userId },
    });

    if (!streak) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastPlayedAt: null,
        isActiveToday: false,
        willExpireIn: null,
      };
    }

    // Si lastPlayedAt est null, le streak n'a pas encore démarré
    if (!streak.lastPlayedAt) {
      return {
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastPlayedAt: null,
        isActiveToday: false,
        willExpireIn: null,
      };
    }

    const today = this.getDateOnly(new Date());
    const lastPlayed = this.getDateOnly(streak.lastPlayedAt);
    const daysDiff = this.daysBetween(lastPlayed, today);

    const isActiveToday = daysDiff === 0;
    const isStreakValid = daysDiff <= 1;

    // Calcul du temps avant expiration du streak
    let willExpireIn: number | null = null;
    if (isStreakValid && !isActiveToday) {
      // Le streak expirera à minuit
      const now = new Date();
      const midnight = new Date(today);
      midnight.setDate(midnight.getDate() + 1);
      willExpireIn = Math.floor((midnight.getTime() - now.getTime()) / (1000 * 60 * 60));
    }

    return {
      currentStreak: isStreakValid ? streak.currentStreak : 0,
      longestStreak: streak.longestStreak,
      lastPlayedAt: streak.lastPlayedAt,
      isActiveToday,
      willExpireIn,
    };
  }

  /**
   * Récupère le classement des meilleurs streaks
   */
  async getStreakLeaderboard(limit: number = 10): Promise<{
    userId: string;
    username: string;
    currentStreak: number;
    longestStreak: number;
  }[]> {
    const today = this.getDateOnly(new Date());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // On récupère les streaks actifs (joué aujourd'hui ou hier)
    const streaks = await this.prisma.userStreak.findMany({
      where: {
        lastPlayedAt: {
          gte: yesterday,
        },
      },
      orderBy: {
        currentStreak: 'desc',
      },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    return streaks.map((s) => ({
      userId: s.user.id,
      username: s.user.username,
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
    }));
  }

  /**
   * Récupère le classement des plus longs streaks historiques
   */
  async getLongestStreakLeaderboard(limit: number = 10): Promise<{
    userId: string;
    username: string;
    longestStreak: number;
  }[]> {
    const streaks = await this.prisma.userStreak.findMany({
      orderBy: {
        longestStreak: 'desc',
      },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    return streaks.map((s) => ({
      userId: s.user.id,
      username: s.user.username,
      longestStreak: s.longestStreak,
    }));
  }

  /**
   * Vérifie si le streak d'un utilisateur est en danger (pas joué aujourd'hui)
   */
  async isStreakAtRisk(userId: string): Promise<boolean> {
    const streak = await this.getCurrentStreak(userId);
    return streak.currentStreak > 0 && !streak.isActiveToday;
  }

  /**
   * Utilitaire: Obtient la date sans l'heure (minuit UTC)
   */
  private getDateOnly(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Utilitaire: Calcule le nombre de jours entre deux dates
   */
  private daysBetween(date1: Date, date2: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((date2.getTime() - date1.getTime()) / msPerDay);
  }
}
