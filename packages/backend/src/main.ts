import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/.env' });
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './modules/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true }));
  app.enableCors({ origin: true, credentials: true });
  await app.listen(3001, '0.0.0.0');
  console.log('Backend listening on http://localhost:3001');
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
