import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import passport from 'passport';

import { DatabaseService } from './services/DatabaseService';
import { AuthService } from './services/AuthService';
import { QuizService } from './services/QuizService';
import { WebSocketService } from './websocket/WebSocketService';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth';
import { quizRoutes } from './routes/quiz';
import { userRoutes } from './routes/user';

dotenv.config();

class Server {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private io: Server;
  private port: number;
  private databaseService: DatabaseService;
  private authService: AuthService;
  private quizService: QuizService;
  private webSocketService: WebSocketService;

  constructor() {
    this.port = parseInt(process.env.PORT || '3000', 10);
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new Server(this.httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: parseInt(process.env.WEBSOCKET_PING_TIMEOUT || '60000', 10),
      pingInterval: parseInt(process.env.WEBSOCKET_PING_INTERVAL || '25000', 10)
    });

    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  private initializeServices(): void {
    this.databaseService = new DatabaseService();
    this.authService = new AuthService();
    this.quizService = new QuizService(this.databaseService);
    this.webSocketService = new WebSocketService(this.io, this.quizService);
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token']
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      message: 'Trop de requêtes depuis cette IP, veuillez réessayer plus tard.',
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Passport initialization
    this.app.use(passport.initialize());
    this.authService.configurePassport();

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  private setupRoutes(): void {
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/quiz', quizRoutes);
    this.app.use('/api/user', userRoutes);

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route non trouvée'
      });
    });
  }

  private setupWebSocket(): void {
    this.webSocketService.initialize();
    logger.info('WebSocket service initialisé');
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);

    process.on('uncaughtException', (error) => {
      logger.error('Exception non gérée:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Rejection non gérée à', promise, 'raison:', reason);
      process.exit(1);
    });
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.databaseService.initialize();
      logger.info('Base de données initialisée');

      // Start server
      this.httpServer.listen(this.port, () => {
        logger.info(`🚀 Serveur SourceKuizz démarré sur le port ${this.port}`);
        logger.info(`📊 Dashboard disponible sur http://localhost:${this.port}/health`);
        logger.info(`🎮 WebSocket prêt pour les interactions temps réel`);
      });
    } catch (error) {
      logger.error('Erreur lors du démarrage du serveur:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    logger.info('Arrêt du serveur...');
    
    return new Promise((resolve) => {
      this.httpServer.close(() => {
        logger.info('Serveur arrêté');
        resolve();
      });
    });
  }
}

// Start server
const server = new Server();
server.start().catch((error) => {
  logger.error('Échec du démarrage:', error);
  process.exit(1);
});

export default server;