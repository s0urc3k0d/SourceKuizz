/// <reference types="jest" />
import 'reflect-metadata';
process.env.TIME_SCALE = '0.12';
process.env.REVEAL_DELAY_MS = '140';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/modules/app.module';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';

let app: INestApplication;
let httpServer: any;

describe('Auto-next flow (E2E)', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    httpServer = app.getHttpServer();
    // Cleanup DB tables for isolation
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

  it('automatically starts subsequent questions when enabled', async () => {
    const reg = await request(httpServer).post('/auth/register').send({ username: 'autonext', password: 'secret123' }).expect(201);
    const token = reg.body.accessToken as string;
    const quiz = await request(httpServer).post('/quizzes').set('Authorization','Bearer '+token).send({ title: 'Auto', description: 'Next' }).expect(201);
    const quizId = quiz.body.id;
  const q1 = await request(httpServer).post(`/quizzes/${quizId}/questions`).set('Authorization','Bearer '+token).send({ type: 'mcq', prompt: 'Q1?', timeLimitMs: 1200, options: [{ label: 'A', isCorrect: true }, { label: 'B', isCorrect: false }] }).expect(201);
  const q2 = await request(httpServer).post(`/quizzes/${quizId}/questions`).set('Authorization','Bearer '+token).send({ type: 'mcq', prompt: 'Q2?', timeLimitMs: 1200, options: [{ label: 'A2', isCorrect: true }, { label: 'B2', isCorrect: false }] }).expect(201);

    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    const url = `http://127.0.0.1:${port}`;
    const sock: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    await new Promise<void>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('connect timeout')),4000); sock.once('connect',()=>{clearTimeout(to);res();}); sock.once('connect_error',(e)=>{clearTimeout(to);rej(e);}); });
    const CODE='AUTO1';
    sock.emit('join_session', { code: CODE, quizId, nickname: 'HostAuto' });
    await new Promise((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no session_state')),3000); sock.once('session_state',(st:any)=>{clearTimeout(to);res(null);}); });
    sock.emit('toggle_auto_next', { code: CODE, enabled: true });
    await new Promise((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no auto_next_toggled')),3000); sock.once('auto_next_toggled',()=>{clearTimeout(to);res(null);}); });
    // Start first question
    sock.emit('start_question', { code: CODE });
    const started1 = await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no q1 start')),3000); sock.once('question_started',(d)=>{clearTimeout(to);res(d);}); });
    expect(started1.questionId).toBe(q1.body.id);
    // Attendre reveal Q1
    await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no reveal q1')),4000); sock.once('question_reveal',(d)=>{ if(d.questionId===q1.body.id){ clearTimeout(to);res(d);} }); });
    // Attendre démarrage automatique Q2
    const started2 = await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no q2 start auto')),4500); sock.on('question_started',(d)=>{ if(d.questionId===q2.body.id){ clearTimeout(to); res(d);} }); });
    expect(started2.questionId).toBe(q2.body.id);
    // Attendre fin de session
    await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no finished')),6000); sock.once('session_finished',(d)=>{clearTimeout(to);res(d);}); });
    sock.disconnect();
  }, 17000);
});
