import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

// Formule XP par niveau: XP_requis = 100 * niveau^1.5
// Niveau 1: 100 XP, Niveau 2: 283 XP, Niveau 5: 1118 XP, Niveau 10: 3162 XP

/**
 * Constantes pour les sources d'XP
 */
export const XP_SOURCES = {
  GAME_WIN: 100,        // Victoire
  GAME_COMPLETE: 25,    // Partie terminée
  CORRECT_ANSWER: 10,   // Bonne réponse
  STREAK_BONUS: 5,      // Série de bonnes réponses (par série de 3)
  PERFECT_GAME: 50,     // Partie parfaite (toutes bonnes réponses)
  FIRST_PLACE: 75,      // 1ère place
  SECOND_PLACE: 50,     // 2ème place
  THIRD_PLACE: 25,      // 3ème place
} as const;

export interface LevelInfo {
  level: number;
  totalXp: number;
  currentLevelXp: number;
  xpForNextLevel: number;
  xpProgress: number; // 0-1
}

export interface XPGainResult {
  previousLevel: number;
  newLevel: number;
  xpGained: number;
  totalXp: number;
  leveledUp: boolean;
  levelInfo: LevelInfo;
}

@Injectable()
export class XPService {
  private readonly logger = new Logger(XPService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Calcule l'XP requis pour atteindre un niveau
   */
  getXpForLevel(level: number): number {
    if (level <= 1) return 0;
    return Math.floor(100 * Math.pow(level, 1.5));
  }

  /**
   * Calcule le niveau à partir du total d'XP
   */
  getLevelFromXp(totalXp: number): number {
    let level = 1;
    while (this.getXpForLevel(level + 1) <= totalXp) {
      level++;
    }
    return level;
  }

  /**
   * Récupère les infos de niveau d'un utilisateur
   */
  async getLevelInfo(userId: string): Promise<LevelInfo> {
    const userXp = await this.getOrCreateUserXP(userId);
    return this.calculateLevelInfo(userXp.totalXp);
  }

  /**
   * Calcule les infos de niveau à partir du total XP
   */
  calculateLevelInfo(totalXp: number): LevelInfo {
    const level = this.getLevelFromXp(totalXp);
    const xpForCurrentLevel = this.getXpForLevel(level);
    const xpForNextLevel = this.getXpForLevel(level + 1);
    const currentLevelXp = totalXp - xpForCurrentLevel;
    const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
    const xpProgress = xpNeededForNext > 0 ? currentLevelXp / xpNeededForNext : 1;

    return {
      level,
      totalXp,
      currentLevelXp,
      xpForNextLevel: xpNeededForNext,
      xpProgress,
    };
  }

  /**
   * Récupère ou crée l'entrée XP d'un utilisateur
   */
  async getOrCreateUserXP(userId: string) {
    const existing = await this.prisma.userXP.findUnique({ where: { userId } });
    if (existing) return existing;

    return this.prisma.userXP.create({
      data: { userId, totalXp: 0, level: 1, currentLevelXp: 0 },
    });
  }

  /**
   * Ajoute de l'XP à un utilisateur
   */
  async addXP(userId: string, amount: number, reason?: string): Promise<XPGainResult> {
    const userXp = await this.getOrCreateUserXP(userId);
    const previousLevel = userXp.level;
    const newTotalXp = userXp.totalXp + amount;
    const newLevelInfo = this.calculateLevelInfo(newTotalXp);

    await this.prisma.userXP.update({
      where: { userId },
      data: {
        totalXp: newTotalXp,
        level: newLevelInfo.level,
        currentLevelXp: newLevelInfo.currentLevelXp,
      },
    });

    const leveledUp = newLevelInfo.level > previousLevel;
    if (leveledUp) {
      this.logger.log(`User ${userId} leveled up: ${previousLevel} -> ${newLevelInfo.level}`);
    }

    return {
      previousLevel,
      newLevel: newLevelInfo.level,
      xpGained: amount,
      totalXp: newTotalXp,
      leveledUp,
      levelInfo: newLevelInfo,
    };
  }

  /**
   * Calcule l'XP gagné pour une partie
   */
  calculateGameXP(stats: {
    rank: number;
    totalPlayers: number;
    correctCount: number;
    totalQuestions: number;
    isWin: boolean;
  }): number {
    let xp = 0;

    // XP de base pour avoir joué
    xp += 10;

    // XP pour les bonnes réponses (5 XP par bonne réponse)
    xp += stats.correctCount * 5;

    // Bonus pour le classement (inversement proportionnel au rang)
    if (stats.totalPlayers > 1) {
      const rankBonus = Math.floor(((stats.totalPlayers - stats.rank) / (stats.totalPlayers - 1)) * 50);
      xp += rankBonus;
    }

    // Bonus victoire
    if (stats.isWin) {
      xp += 25;
    }

    // Bonus podium
    if (stats.rank === 2) xp += 15;
    if (stats.rank === 3) xp += 10;

    // Bonus perfect game
    if (stats.correctCount === stats.totalQuestions && stats.totalQuestions > 0) {
      xp += 50;
    }

    return xp;
  }

  /**
   * Récupère le classement par niveau
   */
  async getLevelLeaderboard(limit = 50) {
    return this.prisma.userXP.findMany({
      orderBy: [{ level: 'desc' }, { totalXp: 'desc' }],
      take: limit,
      include: {
        user: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
    });
  }
}
