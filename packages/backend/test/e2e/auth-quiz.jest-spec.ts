/// <reference types="jest" />
import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/modules/app.module';
import request from 'supertest';
import { PrismaService } from '../../src/modules/database/prisma.service';

let app: INestApplication;
let prisma: PrismaService;

describe('Auth & Quiz & Questions E2E (Jest)', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const p: any = prisma;
    await p.playerAnswer.deleteMany();
    await p.gamePlayer.deleteMany();
    await p.gameSession.deleteMany();
    await p.questionOption.deleteMany();
    await p.question.deleteMany();
    await p.quiz.deleteMany();
    if (p.authSession) await p.authSession.deleteMany();
    await p.user.deleteMany();
  }, 20000);

  afterAll(async () => {
    await app.close();
  });

  it('registers, creates quiz, question lifecycle', async () => {
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'jestuser', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken;

    const quizRes = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Quiz Jest', description: 'Test' })
      .expect(201);
    const quizId = quizRes.body.id;

    const qCreate = await request(app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({
        type: 'mcq',
        prompt: '2+3=?',
        timeLimitMs: 4000,
        options: [
          { label: '4', isCorrect: false },
          { label: '5', isCorrect: true },
        ],
      })
      .expect(201);
    const questionId = qCreate.body.id;

    await request(app.getHttpServer())
      .patch(`/quizzes/${quizId}/questions/${questionId}`)
      .set('Authorization', 'Bearer ' + token)
      .send({ prompt: '2+3 font ?', options: [ { label: '5', isCorrect: true } , { label: '6', isCorrect: false } ] })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(list.body.length).toBe(1);
  }, 20000);

  it('rejects invalid login', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'nope', password: 'xxxxxx' })
      .expect(401);
  }, 10000);
});
