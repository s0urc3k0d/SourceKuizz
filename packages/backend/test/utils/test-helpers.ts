import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TestAppModule } from '../e2e/test-app.module';
import { PrismaService } from '../../src/modules/database/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const prisma = moduleRef.get(PrismaService);
  // Debug injection: vérifier présence AuthService / AuthController
  try {
    const authService = moduleRef.get<any>('AuthService', { strict: false });
    const authController = (app as any).getHttpAdapter()?.getInstance?.()?.get?.('AuthController');
    if (!authService) {
      // eslint-disable-next-line no-console
      console.warn('[TEST DEBUG] AuthService not found via token lookup');
    }
    if (!authController) {
      // eslint-disable-next-line no-console
      console.warn('[TEST DEBUG] AuthController not found');
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[TEST DEBUG] Injection inspection error', e);
  }
  return { app, prisma };
}

export async function resetDatabase(prisma: any) {
  await prisma.playerAnswer.deleteMany();
  await prisma.gamePlayer.deleteMany();
  await prisma.gameSession.deleteMany();
  await prisma.questionOption.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();
  if (prisma.authSession) await prisma.authSession.deleteMany();
  await prisma.user.deleteMany();
}
