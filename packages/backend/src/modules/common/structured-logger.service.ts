import { Injectable, LoggerService, Scope } from '@nestjs/common';

export interface LogContext {
  userId?: string;
  sessionCode?: string;
  socketId?: string;
  action?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface StructuredLog {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Service de logging structuré pour une meilleure observabilité
 * Les logs sont formatés en JSON pour être facilement parsés par des outils comme ELK, Datadog, etc.
 */
@Injectable()
export class StructuredLoggerService implements LoggerService {
  private serviceName: string;

  constructor(serviceName = 'SourceKuizz') {
    this.serviceName = serviceName;
  }

  private formatLog(level: StructuredLog['level'], message: string, context?: LogContext, error?: Error): string {
    const log: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context && Object.keys(context).length > 0) {
      log.context = context;
    }

    if (error) {
      log.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return JSON.stringify(log);
  }

  log(message: string, context?: LogContext) {
    console.log(this.formatLog('info', message, context));
  }

  info(message: string, context?: LogContext) {
    console.log(this.formatLog('info', message, context));
  }

  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.formatLog('debug', message, context));
    }
  }

  warn(message: string, context?: LogContext) {
    console.warn(this.formatLog('warn', message, context));
  }

  error(message: string, error?: Error | string, context?: LogContext) {
    const err = typeof error === 'string' ? new Error(error) : error;
    console.error(this.formatLog('error', message, context, err));
  }

  // Méthodes utilitaires pour des logs courants
  logRequest(method: string, path: string, statusCode: number, durationMs: number, context?: LogContext) {
    this.info(`${method} ${path} ${statusCode}`, {
      ...context,
      action: 'http_request',
      duration: durationMs,
    });
  }

  logWebSocket(event: string, socketId: string, context?: LogContext) {
    this.debug(`WS ${event}`, {
      ...context,
      socketId,
      action: 'websocket_event',
    });
  }

  logSessionAction(action: string, sessionCode: string, context?: LogContext) {
    this.info(`Session ${action}`, {
      ...context,
      sessionCode,
      action: `session_${action}`,
    });
  }

  logAuthAction(action: string, userId?: string, context?: LogContext) {
    this.info(`Auth ${action}`, {
      ...context,
      userId,
      action: `auth_${action}`,
    });
  }

  logDatabaseQuery(operation: string, table: string, durationMs: number, context?: LogContext) {
    this.debug(`DB ${operation} on ${table}`, {
      ...context,
      action: 'database_query',
      duration: durationMs,
    });
  }
}

// Singleton pour utilisation simple
export const logger = new StructuredLoggerService();
