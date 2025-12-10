import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { logger } from '../common/structured-logger.service';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  requestId?: string;
}

/**
 * Filtre global pour capturer toutes les exceptions et les logger de manière structurée
 * Évite les erreurs silencieuses et améliore la debuggabilité
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        error = (resp.error as string) || exception.name;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request?.url || 'unknown',
    };

    // Extraire le requestId si disponible
    const requestId = request?.headers?.['x-request-id'];
    if (requestId) {
      errorResponse.requestId = requestId as string;
    }

    // Logger l'erreur de manière structurée
    const logContext = {
      statusCode: status,
      path: request?.url,
      method: request?.method,
      requestId: requestId as string | undefined,
      userId: request?.user?.id,
    };

    if (status >= 500) {
      // Erreurs serveur : log complet avec stack trace
      logger.error(
        `${request?.method} ${request?.url} - ${status} ${error}`,
        exception instanceof Error ? exception : new Error(String(exception)),
        logContext
      );
    } else if (status >= 400) {
      // Erreurs client : log warning sans stack
      logger.warn(`${request?.method} ${request?.url} - ${status} ${message}`, logContext);
    }

    // Envoyer la réponse
    // Support Fastify et Express
    if (response.status) {
      response.status(status).send(errorResponse);
    } else if (response.code) {
      response.code(status).send(errorResponse);
    }
  }
}

/**
 * Helper pour wrapper les erreurs async et éviter les rejections non gérées
 */
export function wrapAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args) as ReturnType<T>;
    } catch (error) {
      logger.error('Unhandled async error', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  };
}

/**
 * Décorateur pour logger automatiquement les erreurs d'une méthode
 */
export function LogErrors(context?: string) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        logger.error(
          `Error in ${context || propertyKey}`,
          error instanceof Error ? error : new Error(String(error)),
          { method: propertyKey }
        );
        throw error;
      }
    };

    return descriptor;
  };
}
