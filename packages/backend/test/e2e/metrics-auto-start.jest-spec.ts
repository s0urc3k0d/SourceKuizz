/// <reference types="jest" />
import 'reflect-metadata';
process.env.TIME_SCALE = '0.12';
process.env.REVEAL_DELAY_MS = '120';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/modules/app.module';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';

let app: INestApplication;
let httpServer: any;

describe('Metrics auto_start (E2E)', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    httpServer = app.getHttpServer();
    // Cleanup DB
    try {
      const prisma: any = moduleRef.get<any>('PrismaService');
      await prisma.playerAnswer.deleteMany();
      await prisma.gamePlayer.deleteMany();
      await prisma.gameSession.deleteMany();
      await prisma.questionOption.deleteMany();
      await prisma.question.deleteMany();
      await prisma.quiz.deleteMany();
      if (prisma.authSession) await prisma.authSession.deleteMany();
      await prisma.user.deleteMany();
    } catch {}
  });
  afterAll(async () => { try { const gw: any = app.get<any>('RealtimeGateway'); if (gw?.dispose) gw.dispose(); } catch{}; await app.close(); });

  it('increments question.auto_start when auto-next triggers second question', async () => {
    // Isolation défensive (si un autre test a réutilisé l'instance Nest en parallèle dans le futur)
    try {
      const prisma: any = (app as any).get?.('PrismaService');
      if (prisma) {
        await prisma.playerAnswer.deleteMany();
        await prisma.gamePlayer.deleteMany();
        await prisma.gameSession.deleteMany();
        await prisma.questionOption.deleteMany();
        await prisma.question.deleteMany();
        await prisma.quiz.deleteMany();
        if (prisma.authSession) await prisma.authSession.deleteMany();
        await prisma.user.deleteMany();
      }
    } catch {}
    const baseUser = 'autostartM';
    let token: string | undefined;
    const attempt = await request(httpServer).post('/auth/register').send({ username: baseUser, password: 'secret123' });
    if (attempt.status === 201) {
      token = attempt.body.accessToken;
    } else {
      // collision improbable -> réessayer avec suffixe unique
      const uniq = baseUser + Date.now();
      const reg2 = await request(httpServer).post('/auth/register').send({ username: uniq, password: 'secret123' }).expect(201);
      token = reg2.body.accessToken;
    }
    if (!token) throw new Error('no token');
    const quiz = await request(httpServer).post('/quizzes').set('Authorization','Bearer '+token).send({ title: 'AutoStart', description: 'Metric' }).expect(201);
    const quizId = quiz.body.id;
  const q1 = await request(httpServer).post(`/quizzes/${quizId}/questions`).set('Authorization','Bearer '+token).send({ type: 'mcq', prompt: 'Q1?', timeLimitMs: 1200, options: [{ label: 'A', isCorrect: true }, { label: 'B', isCorrect: false }] }).expect(201);
  const q2 = await request(httpServer).post(`/quizzes/${quizId}/questions`).set('Authorization','Bearer '+token).send({ type: 'mcq', prompt: 'Q2?', timeLimitMs: 1200, options: [{ label: 'A2', isCorrect: true }, { label: 'B2', isCorrect: false }] }).expect(201);
    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    const url = `http://127.0.0.1:${port}`;
    const sock: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    await new Promise<void>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('connect timeout')),4000); sock.once('connect',()=>{clearTimeout(to);res();}); sock.once('connect_error',(e)=>{clearTimeout(to);rej(e);}); });
    const CODE='AUTM1';
    sock.emit('join_session', { code: CODE, quizId, nickname: 'Host' });
    await new Promise((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no session_state')),3000); sock.once('session_state',()=>{clearTimeout(to);res(null);}); });
    sock.emit('toggle_auto_next', { code: CODE, enabled: true });
    await new Promise((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no auto_next_toggled')),3000); sock.once('auto_next_toggled',()=>{clearTimeout(to);res(null);}); });
    sock.emit('start_question', { code: CODE });
    await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no q1 start')),3000); sock.once('question_started',(d)=>{ if(d.questionId===q1.body.id){clearTimeout(to);res(d);} }); });
    await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no reveal q1')),4000); sock.once('question_reveal',(d)=>{ if(d.questionId===q1.body.id){clearTimeout(to);res(d);} }); });
    await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no q2 auto start')),4500); sock.on('question_started',(d)=>{ if(d.questionId===q2.body.id){clearTimeout(to);res(d);} }); });
    // récupérer métriques
    const metricsRes = await request(httpServer).get('/metrics').expect(200);
    const counters = metricsRes.body.counters || {};
    expect(counters['question.auto_start']).toBeGreaterThanOrEqual(1);
    sock.disconnect();
  }, 16000);
});
