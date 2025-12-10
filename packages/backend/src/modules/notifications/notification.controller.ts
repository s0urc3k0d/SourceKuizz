import { Controller, Get, Post, Patch, Delete, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationService, UpdateNotificationPrefsDto, PushSubscription } from './notification.service';
import type { AuthenticatedUser } from '../../types';

@Controller('notifications')
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  /**
   * GET /notifications/vapid-key - Récupérer la clé publique VAPID
   */
  @Get('vapid-key')
  getVapidKey() {
    const key = this.notificationService.getVapidPublicKey();
    return { vapidPublicKey: key };
  }

  /**
   * GET /notifications/preferences - Récupérer ses préférences
   */
  @UseGuards(JwtAuthGuard)
  @Get('preferences')
  async getPreferences(@Request() req: { user: AuthenticatedUser }) {
    return this.notificationService.getOrCreatePreferences(req.user.id);
  }

  /**
   * PATCH /notifications/preferences - Mettre à jour les préférences
   */
  @UseGuards(JwtAuthGuard)
  @Patch('preferences')
  async updatePreferences(
    @Request() req: { user: AuthenticatedUser },
    @Body() body: UpdateNotificationPrefsDto,
  ) {
    return this.notificationService.updatePreferences(req.user.id, body);
  }

  /**
   * POST /notifications/subscribe - S'abonner aux notifications push
   */
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(
    @Request() req: { user: AuthenticatedUser },
    @Body() subscription: PushSubscription,
  ) {
    await this.notificationService.subscribePush(req.user.id, subscription);
    return { success: true };
  }

  /**
   * DELETE /notifications/subscribe - Se désabonner
   */
  @UseGuards(JwtAuthGuard)
  @Delete('subscribe')
  async unsubscribe(@Request() req: { user: AuthenticatedUser }) {
    await this.notificationService.unsubscribePush(req.user.id);
    return { success: true };
  }

  /**
   * POST /notifications/test - Envoyer une notification test
   */
  @UseGuards(JwtAuthGuard)
  @Post('test')
  async testNotification(@Request() req: { user: AuthenticatedUser }) {
    const sent = await this.notificationService.sendPushNotification(req.user.id, {
      title: 'Test de notification',
      body: 'Les notifications push fonctionnent ! 🎉',
      icon: '/icons/test.png',
    });
    return { sent };
  }
}
