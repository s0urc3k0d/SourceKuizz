import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';

/**
 * Liste des comptes Twitch autorisés à accéder aux fonctionnalités admin
 * Ces comptes ont accès au dashboard analytics complet
 */
export const ADMIN_TWITCH_USERNAMES = [
  'lantredesilver',
  // Ajouter d'autres admins ici si nécessaire
];

export const IS_ADMIN_KEY = 'isAdmin';

/**
 * Décorateur pour marquer un endpoint comme réservé aux admins
 */
export function AdminOnly() {
  return (target: any, key?: string, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(IS_ADMIN_KEY, true, descriptor?.value ?? target);
    return descriptor ?? target;
  };
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Vérifier si l'endpoint nécessite les droits admin
    const requiresAdmin = this.reflector.get<boolean>(
      IS_ADMIN_KEY,
      context.getHandler(),
    );

    if (!requiresAdmin) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) {
      throw new ForbiddenException('Authentication required');
    }

    // Récupérer l'utilisateur avec son twitchId
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { username: true, twitchId: true },
    });

    if (!dbUser) {
      throw new ForbiddenException('User not found');
    }

    // Vérifier si le username (qui vient de Twitch) est dans la liste des admins
    const isAdmin = ADMIN_TWITCH_USERNAMES.some(
      (admin) => admin.toLowerCase() === dbUser.username.toLowerCase(),
    );

    if (!isAdmin) {
      throw new ForbiddenException({
        error: 'admin_required',
        message: 'This feature is restricted to administrators',
      });
    }

    // Attacher le flag admin à la requête
    request.isAdmin = true;

    return true;
  }
}

/**
 * Helper pour vérifier si un username est admin
 */
export function isAdminUser(username: string): boolean {
  return ADMIN_TWITCH_USERNAMES.some(
    (admin) => admin.toLowerCase() === username.toLowerCase(),
  );
}
