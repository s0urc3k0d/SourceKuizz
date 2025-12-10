import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/.env' });
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './modules/app.module';
import { GlobalExceptionFilter } from './modules/common/global-exception.filter';
import { logger } from './modules/common/structured-logger.service';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule, 
    new FastifyAdapter({ logger: process.env.NODE_ENV !== 'production' })
  );
  
  // CORS avec credentials pour les cookies
  app.enableCors({ origin: true, credentials: true });
  
  // Filtre global pour la gestion des erreurs
  app.useGlobalFilters(new GlobalExceptionFilter());
  
  // Support des cookies (nécessaire pour httpOnly tokens)
  await app.register(require('@fastify/cookie'));
  
  const port = parseInt(process.env.PORT || '3001', 10);
  await app.listen(port, '0.0.0.0');
  
  logger.info(`Backend started`, { port, env: process.env.NODE_ENV || 'development' });
}

bootstrap().catch((err) => {
  logger.error('Fatal bootstrap error', err);
  process.exit(1);
});
