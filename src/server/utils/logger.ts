import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'info';
const logFile = process.env.LOG_FILE || path.join(logsDir, 'app.log');

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

// Format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger
export const logger = winston.createLogger({
  level: logLevel,
  format: fileFormat,
  transports: [
    // File transport
    new winston.transports.File({
      filename: logFile,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Error file transport
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log')
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log')
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Add context methods for structured logging
export const logWithContext = {
  info: (message: string, context?: object) => {
    logger.info(message, context);
  },
  
  error: (message: string, error?: Error | object) => {
    if (error instanceof Error) {
      logger.error(message, {
        error: error.message,
        stack: error.stack,
        name: error.name
      });
    } else {
      logger.error(message, error);
    }
  },
  
  warn: (message: string, context?: object) => {
    logger.warn(message, context);
  },
  
  debug: (message: string, context?: object) => {
    logger.debug(message, context);
  },
  
  // Log HTTP requests
  request: (method: string, url: string, statusCode: number, responseTime: number, userId?: number) => {
    logger.info('HTTP Request', {
      method,
      url,
      statusCode,
      responseTime: `${responseTime}ms`,
      userId: userId || 'anonymous'
    });
  },
  
  // Log WebSocket events
  websocket: (event: string, socketId: string, userId?: number, data?: object) => {
    logger.info('WebSocket Event', {
      event,
      socketId,
      userId: userId || 'anonymous',
      ...data
    });
  },
  
  // Log quiz events
  quiz: (action: string, quizId?: number, sessionId?: number, userId?: number, data?: object) => {
    logger.info('Quiz Event', {
      action,
      quizId,
      sessionId,
      userId,
      ...data
    });
  },
  
  // Log authentication events
  auth: (action: string, username?: string, success?: boolean, reason?: string) => {
    logger.info('Auth Event', {
      action,
      username,
      success,
      reason
    });
  }
};

export default logger;