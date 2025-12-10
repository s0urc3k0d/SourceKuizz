import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

// Définition des badges disponibles
export const BADGE_DEFINITIONS = [
  // Achievements
  { code: 'first_game', name: 'Première Partie', description: 'Jouer sa première partie', category: 'achievement', rarity: 'common', xpReward: 10 },
  { code: 'first_win', name: 'Première Victoire', description: 'Gagner sa première partie', category: 'achievement', rarity: 'common', xpReward: 25 },
  { code: 'perfect_game', name: 'Sans Faute', description: '100% de bonnes réponses dans une partie', category: 'achievement', rarity: 'rare', xpReward: 100 },
  { code: 'speed_demon', name: 'Éclair', description: 'Répondre en moins de 1 seconde (correct)', category: 'achievement', rarity: 'rare', xpReward: 50 },
  { code: 'comeback_king', name: 'Roi du Comeback', description: 'Gagner après avoir été dernier', category: 'achievement', rarity: 'epic', xpReward: 150 },
  
  // Milestones - Games
  { code: 'games_10', name: 'Joueur Régulier', description: 'Jouer 10 parties', category: 'milestone', rarity: 'common', xpReward: 50 },
  { code: 'games_50', name: 'Joueur Assidu', description: 'Jouer 50 parties', category: 'milestone', rarity: 'rare', xpReward: 150 },
  { code: 'games_100', name: 'Vétéran', description: 'Jouer 100 parties', category: 'milestone', rarity: 'epic', xpReward: 300 },
  { code: 'games_500', name: 'Légende', description: 'Jouer 500 parties', category: 'milestone', rarity: 'legendary', xpReward: 1000 },
  
  // Milestones - Wins
  { code: 'wins_5', name: 'Gagnant', description: 'Gagner 5 parties', category: 'milestone', rarity: 'common', xpReward: 75 },
  { code: 'wins_25', name: 'Champion', description: 'Gagner 25 parties', category: 'milestone', rarity: 'rare', xpReward: 200 },
  { code: 'wins_100', name: 'Maître', description: 'Gagner 100 parties', category: 'milestone', rarity: 'epic', xpReward: 500 },
  
  // Streaks
  { code: 'streak_3', name: 'En Forme', description: 'Jouer 3 jours d\'affilée', category: 'streak', rarity: 'common', xpReward: 30 },
  { code: 'streak_7', name: 'Semaine Parfaite', description: 'Jouer 7 jours d\'affilée', category: 'streak', rarity: 'rare', xpReward: 100 },
  { code: 'streak_30', name: 'Mois Complet', description: 'Jouer 30 jours d\'affilée', category: 'streak', rarity: 'epic', xpReward: 500 },
  { code: 'streak_100', name: 'Centenaire', description: 'Jouer 100 jours d\'affilée', category: 'streak', rarity: 'legendary', xpReward: 2000 },
  
  // Special
  { code: 'early_adopter', name: 'Early Adopter', description: 'Rejoindre pendant la bêta', category: 'special', rarity: 'epic', xpReward: 200 },
  { code: 'quiz_creator', name: 'Créateur', description: 'Créer son premier quiz', category: 'special', rarity: 'common', xpReward: 50 },
  { code: 'host_10', name: 'Animateur', description: 'Héberger 10 parties', category: 'special', rarity: 'rare', xpReward: 100 },
];

export interface BadgeWithEarned {
  id: string;
  code: string;
  name: string;
  description: string;
  iconUrl: string | null;
  category: string;
  rarity: string;
  xpReward: number;
  earned: boolean;
  earnedAt?: Date;
}

@Injectable()
export class BadgeService implements OnModuleInit {
  private readonly logger = new Logger(BadgeService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Seed les badges au démarrage
    await this.seedBadges();
  }

  private async seedBadges() {
    for (const def of BADGE_DEFINITIONS) {
      await this.prisma.badge.upsert({
        where: { code: def.code },
        create: def,
        update: { name: def.name, description: def.description, xpReward: def.xpReward },
      });
    }
    this.logger.log(`Seeded ${BADGE_DEFINITIONS.length} badges`);
  }

  /**
   * Récupère tous les badges avec le statut "earned" pour un utilisateur
   */
  async getAllBadgesForUser(userId: string): Promise<BadgeWithEarned[]> {
    const [allBadges, userBadges] = await Promise.all([
      this.prisma.badge.findMany({ orderBy: [{ category: 'asc' }, { rarity: 'asc' }] }),
      this.prisma.userBadge.findMany({ where: { userId }, include: { badge: true } }),
    ]);

    const earnedMap = new Map(userBadges.map(ub => [ub.badgeId, ub.earnedAt]));

    return allBadges.map(badge => ({
      id: badge.id,
      code: badge.code,
      name: badge.name,
      description: badge.description,
      iconUrl: badge.iconUrl,
      category: badge.category,
      rarity: badge.rarity,
      xpReward: badge.xpReward,
      earned: earnedMap.has(badge.id),
      earnedAt: earnedMap.get(badge.id),
    }));
  }

  /**
   * Récupère les badges gagnés par un utilisateur
   */
  async getUserBadges(userId: string) {
    return this.prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    });
  }

  /**
   * Attribue un badge à un utilisateur (si pas déjà attribué)
   * Retourne le badge si nouvellement attribué, null sinon
   */
  async awardBadge(userId: string, badgeCode: string) {
    const badge = await this.prisma.badge.findUnique({ where: { code: badgeCode } });
    if (!badge) {
      this.logger.warn(`Badge not found: ${badgeCode}`);
      return null;
    }

    // Vérifier si déjà attribué
    const existing = await this.prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId, badgeId: badge.id } },
    });
    if (existing) return null;

    // Attribuer le badge
    const userBadge = await this.prisma.userBadge.create({
      data: { userId, badgeId: badge.id },
      include: { badge: true },
    });

    this.logger.log(`Badge "${badgeCode}" awarded to user ${userId}`);
    return userBadge;
  }

  /**
   * Vérifie et attribue les badges après une partie
   */
  async checkAndAwardBadges(
    userId: string,
    gameStats: {
      rank: number;
      totalPlayers: number;
      correctRate: number;
      isWin: boolean;
      fastestAnswerMs?: number;
      wasLast?: boolean;
    }
  ): Promise<Array<{ badge: any; xpAwarded: number }>> {
    const awarded: Array<{ badge: any; xpAwarded: number }> = [];

    // Récupérer les stats globales
    const [history, userBadges] = await Promise.all([
      this.prisma.gameHistory.findMany({ where: { userId } }),
      this.prisma.userBadge.findMany({ where: { userId } }),
    ]);

    const totalGames = history.length;
    const totalWins = history.filter(h => h.rank === 1).length;
    const earnedCodes = new Set(
      (await this.prisma.userBadge.findMany({
        where: { userId },
        include: { badge: true },
      })).map(ub => ub.badge.code)
    );

    // Helper pour attribuer et collecter
    const tryAward = async (code: string) => {
      if (earnedCodes.has(code)) return;
      const result = await this.awardBadge(userId, code);
      if (result) {
        awarded.push({ badge: result.badge, xpAwarded: result.badge.xpReward });
      }
    };

    // Première partie
    if (totalGames === 1) await tryAward('first_game');

    // Première victoire
    if (gameStats.isWin && totalWins === 1) await tryAward('first_win');

    // Sans faute
    if (gameStats.correctRate === 1) await tryAward('perfect_game');

    // Éclair (réponse < 1s)
    if (gameStats.fastestAnswerMs && gameStats.fastestAnswerMs < 1000) {
      await tryAward('speed_demon');
    }

    // Comeback king
    if (gameStats.isWin && gameStats.wasLast) await tryAward('comeback_king');

    // Milestones games
    if (totalGames >= 10) await tryAward('games_10');
    if (totalGames >= 50) await tryAward('games_50');
    if (totalGames >= 100) await tryAward('games_100');
    if (totalGames >= 500) await tryAward('games_500');

    // Milestones wins
    if (totalWins >= 5) await tryAward('wins_5');
    if (totalWins >= 25) await tryAward('wins_25');
    if (totalWins >= 100) await tryAward('wins_100');

    return awarded;
  }

  /**
   * Vérification automatique des badges (streaks)
   * Appelé après chaque partie pour vérifier les badges de streak
   */
  async checkStreakBadges(userId: string): Promise<Array<{ badge: any; xpAwarded: number }>> {
    const awarded: Array<{ badge: any; xpAwarded: number }> = [];
    
    const streak = await this.prisma.userStreak.findUnique({ where: { userId } });
    if (!streak) return awarded;

    const currentStreak = streak.currentStreak;
    const longestStreak = streak.longestStreak;
    const maxStreak = Math.max(currentStreak, longestStreak);

    const earnedCodes = new Set(
      (await this.prisma.userBadge.findMany({
        where: { userId },
        include: { badge: true },
      })).map(ub => ub.badge.code)
    );

    const tryAward = async (code: string) => {
      if (earnedCodes.has(code)) return;
      const result = await this.awardBadge(userId, code);
      if (result) {
        awarded.push({ badge: result.badge, xpAwarded: result.badge.xpReward });
      }
    };

    if (maxStreak >= 3) await tryAward('streak_3');
    if (maxStreak >= 7) await tryAward('streak_7');
    if (maxStreak >= 30) await tryAward('streak_30');
    if (maxStreak >= 100) await tryAward('streak_100');

    return awarded;
  }

  /**
   * Obtenir tous les badges disponibles
   */
  getAvailableBadges() {
    return BADGE_DEFINITIONS;
  }
}
