import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TestAppModule } from './test-app.module';
import request from 'supertest';
import { PrismaService } from '../../src/modules/database/prisma.service';

let app: INestApplication;
let prisma: PrismaService;

// NOTE: Ce test E2E est géré par Jest (voir auth-quiz.jest-spec.ts). Version Vitest désactivée pour éviter problème de metadata décorateurs.
describe.skip('Auth & Quiz & Questions E2E (vitest skipped)', () => {
  beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
  app = moduleRef.createNestApplication();
    prisma = moduleRef.get(PrismaService);
    await app.init();
    // Clean DB (basic)
  // Nettoyage (ordre inverse des dépendances). Cast 'as any' pour contourner un éventuel décalage de génération de types pendant le test.
  const p: any = prisma as any;
  await p.playerAnswer.deleteMany();
  await p.gamePlayer.deleteMany();
  await p.gameSession.deleteMany();
  await p.questionOption.deleteMany();
  await p.question.deleteMany();
  await p.quiz.deleteMany();
  if (p.authSession) await p.authSession.deleteMany();
  await p.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, creates quiz, adds question lifecycle', async () => {
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'e2euser', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken;
    expect(token).toBeDefined();

    const quizRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Quiz E2E', description: 'Test' })
      .expect(201);
    const quizId = quizRes.body.id;
    expect(quizId).toBeDefined();

    const qCreate = await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({
        type: 'mcq',
        prompt: '2+2=?',
        timeLimitMs: 5000,
        options: [
          { label: '3', isCorrect: false },
          { label: '4', isCorrect: true },
        ],
      })
      .expect(201);
    const questionId = qCreate.body.id;
    expect(questionId).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/quizzes/${quizId}/questions/${questionId}`)
      .set('Authorization', 'Bearer ' + token)
      .send({ prompt: '2+2 fait ?', options: [ { label: '4', isCorrect: true }, { label: '5', isCorrect: false } ] })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(list.body.length).toBe(1);

    await request(app.getHttpServer())
      .delete(`/quizzes/${quizId}/questions/${questionId}`)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);

    const listAfter = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(listAfter.body.length).toBe(0);
  });

  it('rejects invalid login', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'nope', password: 'xxxxxx' }) // password min length
      .expect(401);
  });
});
