import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from './api-key.service';

export const API_KEY_SCOPES = 'api_key_scopes';

/**
 * Décorateur pour spécifier les scopes requis
 */
export function RequireScopes(...scopes: string[]) {
  return (target: any, key?: string, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(API_KEY_SCOPES, scopes, descriptor?.value ?? target);
    return descriptor ?? target;
  };
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Extraire la clé API du header
    const authHeader = request.headers['authorization'];
    const apiKeyHeader = request.headers['x-api-key'];
    
    let apiKey: string | undefined;
    
    if (authHeader?.startsWith('Bearer sk_live_')) {
      apiKey = authHeader.substring(7);
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }

    if (!apiKey) {
      throw new UnauthorizedException({
        error: 'missing_api_key',
        message: 'API key required. Use Authorization: Bearer sk_live_xxx or X-API-Key header',
      });
    }

    const result = await this.apiKeyService.validateApiKey(apiKey);

    if (!result.valid) {
      throw new UnauthorizedException({
        error: result.error,
        message: this.getErrorMessage(result.error!),
      });
    }

    // Vérifier les scopes requis
    const requiredScopes = this.reflector.get<string[]>(
      API_KEY_SCOPES,
      context.getHandler(),
    ) || [];

    if (requiredScopes.length > 0) {
      const hasAllScopes = requiredScopes.every((scope) =>
        result.scopes?.includes(scope) || result.scopes?.includes('admin'),
      );

      if (!hasAllScopes) {
        throw new UnauthorizedException({
          error: 'insufficient_scopes',
          message: `Required scopes: ${requiredScopes.join(', ')}`,
        });
      }
    }

    // Attacher les infos utilisateur à la requête
    request.apiKeyUser = {
      userId: result.userId,
      scopes: result.scopes,
    };

    return true;
  }

  private getErrorMessage(error: string): string {
    const messages: Record<string, string> = {
      invalid_key_format: 'Invalid API key format',
      key_not_found: 'API key not found',
      key_revoked: 'API key has been revoked',
      key_expired: 'API key has expired',
    };
    return messages[error] || 'Authentication failed';
  }
}
