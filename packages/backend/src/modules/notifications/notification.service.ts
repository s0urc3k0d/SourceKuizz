import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as webpush from 'web-push';

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string; icon?: string }>;
}

export interface UpdateNotificationPrefsDto {
  pushEnabled?: boolean;
  notifyGameInvite?: boolean;
  notifyGameStart?: boolean;
  notifyNewFollower?: boolean;
  notifyWeeklyReport?: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private vapidConfigured = false;

  constructor(private prisma: PrismaService) {
    this.initVapid();
  }

  private initVapid() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const email = process.env.VAPID_EMAIL || 'mailto:admin@sourcekuizz.local';

    if (publicKey && privateKey) {
      try {
        webpush.setVapidDetails(email, publicKey, privateKey);
        this.vapidConfigured = true;
        this.logger.log('VAPID keys configured');
      } catch (error) {
        this.logger.warn('Failed to configure VAPID keys', error);
      }
    } else {
      this.logger.warn('VAPID keys not configured - push notifications disabled');
    }
  }

  /**
   * Récupère ou crée les préférences de notification
   */
  async getOrCreatePreferences(userId: string) {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (existing) return existing;

    return this.prisma.notificationPreference.create({
      data: { userId },
    });
  }

  /**
   * Met à jour les préférences
   */
  async updatePreferences(userId: string, dto: UpdateNotificationPrefsDto) {
    await this.getOrCreatePreferences(userId);

    return this.prisma.notificationPreference.update({
      where: { userId },
      data: {
        pushEnabled: dto.pushEnabled,
        notifyGameInvite: dto.notifyGameInvite,
        notifyGameStart: dto.notifyGameStart,
        notifyNewFollower: dto.notifyNewFollower,
        notifyWeeklyReport: dto.notifyWeeklyReport,
      },
    });
  }

  /**
   * Enregistre un abonnement push
   */
  async subscribePush(userId: string, subscription: PushSubscription) {
    await this.getOrCreatePreferences(userId);

    return this.prisma.notificationPreference.update({
      where: { userId },
      data: {
        pushEnabled: true,
        pushSubscription: JSON.stringify(subscription),
      },
    });
  }

  /**
   * Supprime l'abonnement push
   */
  async unsubscribePush(userId: string) {
    await this.getOrCreatePreferences(userId);

    return this.prisma.notificationPreference.update({
      where: { userId },
      data: {
        pushEnabled: false,
        pushSubscription: null,
      },
    });
  }

  /**
   * Envoie une notification push à un utilisateur
   */
  async sendPushNotification(userId: string, payload: NotificationPayload): Promise<boolean> {
    if (!this.vapidConfigured) {
      this.logger.debug('Push notification skipped - VAPID not configured');
      return false;
    }

    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs?.pushEnabled || !prefs.pushSubscription) {
      return false;
    }

    try {
      const subscription = JSON.parse(prefs.pushSubscription) as PushSubscription;
      await webpush.sendNotification(
        subscription,
        JSON.stringify(payload),
        { TTL: 86400 } // 24h
      );
      return true;
    } catch (error: any) {
      // Si l'abonnement est expiré ou invalide
      if (error.statusCode === 410 || error.statusCode === 404) {
        this.logger.warn(`Push subscription expired for user ${userId}, removing`);
        await this.unsubscribePush(userId);
      } else {
        this.logger.error(`Failed to send push notification to ${userId}`, error);
      }
      return false;
    }
  }

  /**
   * Envoie une notification de type "game invite"
   */
  async notifyGameInvite(userId: string, inviterName: string, sessionCode: string) {
    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs?.notifyGameInvite) return false;

    return this.sendPushNotification(userId, {
      title: 'Invitation à une partie',
      body: `${inviterName} vous invite à rejoindre une partie !`,
      icon: '/icons/game-invite.png',
      data: { type: 'game-invite', sessionCode },
      actions: [
        { action: 'join', title: 'Rejoindre' },
        { action: 'dismiss', title: 'Ignorer' },
      ],
    });
  }

  /**
   * Envoie une notification de début de partie
   */
  async notifyGameStart(userId: string, quizTitle: string, sessionCode: string) {
    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs?.notifyGameStart) return false;

    return this.sendPushNotification(userId, {
      title: 'La partie commence !',
      body: `Le quiz "${quizTitle}" va commencer`,
      icon: '/icons/game-start.png',
      data: { type: 'game-start', sessionCode },
    });
  }

  /**
   * Récupère la clé publique VAPID pour le frontend
   */
  getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }
}
