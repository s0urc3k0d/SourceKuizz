// ARCHIVÉ: Ancien test E2E (Vitest unification). Conservé pour référence mais ignoré par Vitest (dossier exclu).
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDatabase } from '../utils/test-helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

describe('LEGACY Vitest E2E: Auth & Quiz & Questions', () => {
  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma as any);
  }, 20000);

  afterAll(async () => {
    await ctx.app.close();
  });

  it('register -> quiz -> question lifecycle', async () => {
    const reg = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'vitestuser', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken;
    expect(token).toBeDefined();

    const quizRes = await request(ctx.app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Quiz V', description: 'Desc' })
      .expect(201);
    const quizId = quizRes.body.id;
    expect(quizId).toBeDefined();

    const qRes = await request(ctx.app.getHttpServer())
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({
        type: 'mcq',
        prompt: '1+1=?',
        timeLimitMs: 3000,
        options: [ { label: '2', isCorrect: true }, { label: '3', isCorrect: false } ],
      })
      .expect(201);
    const qId = qRes.body.id;
    expect(qId).toBeDefined();

    await request(ctx.app.getHttpServer())
      .patch(`/quizzes/${quizId}/questions/${qId}`)
      .set('Authorization', 'Bearer ' + token)
      .send({ prompt: '1+1 = ?', options: [ { label: '2', isCorrect: true } , { label: '4', isCorrect: false } ] })
      .expect(200);

    const list = await request(ctx.app.getHttpServer())
      .get(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(list.body.length).toBe(1);
  }, 20000);

  it('invalid login', async () => {
    await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'nouser', password: 'xxxxxx' })
      .expect(401);
  }, 10000);
});
