/// <reference types="jest" />
import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/modules/app.module';
import request from 'supertest';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { io, Socket } from 'socket.io-client';

let app: INestApplication;
let prisma: PrismaService;
let httpServer: any;

describe('Metrics endpoint', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    prisma = moduleRef.get(PrismaService);
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    try { const gw: any = app.get<any>('RealtimeGateway'); if (gw?.dispose) gw.dispose(); } catch {}
    await app.close();
  });

  it('collects realtime counters', async () => {
    // Register user
    const reg = await request(httpServer)
      .post('/auth/register')
      .send({ username: 'metricsUser', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken as string;

    // Create quiz + question
    const quizRes = await request(httpServer)
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Metrics quiz', description: 'metrics' })
      .expect(201);
    const quizId = quizRes.body.id as string;
    const qRes = await request(httpServer)
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({ type: 'mcq', prompt: 'M?', timeLimitMs: 1500, options: [ { label: 'Yes', isCorrect: true }, { label: 'No', isCorrect: false } ] })
      .expect(201);
    const questionId = qRes.body.id as string;
    const optionCorrectId = qRes.body.options.find((o: any)=>o.isCorrect).id as string;

    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    const url = `http://127.0.0.1:${port}`;
    const socket: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    await new Promise<void>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('connect timeout')),4000); socket.once('connect',()=>{clearTimeout(to);res();}); socket.once('connect_error',(e)=>{clearTimeout(to);rej(e);}); });
    const CODE = 'METR1';
    socket.emit('join_session', { code: CODE, quizId, nickname: 'Metrix' });
    await new Promise<any>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('no state')),3000); socket.once('session_state',(s)=>{clearTimeout(to);res(s);}); });
    // Start question as host
    socket.emit('start_question', { code: CODE });
    await new Promise<any>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('no started')),3000); socket.once('question_started',(d)=>{clearTimeout(to);res(d);}); });
    // Answer
    socket.emit('submit_answer', { questionId, optionId: optionCorrectId, clientTs: Date.now(), code: CODE });
    await new Promise<any>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('no ack')),3000); socket.once('answer_ack',(a)=>{clearTimeout(to);res(a);}); });
    // Reaction
    socket.emit('reaction', { emoji: '🔥', code: CODE });
    await new Promise(r=>setTimeout(r,50));
    socket.disconnect();

    const metricsRes = await request(httpServer).get('/metrics').expect(200);
    const counters = metricsRes.body.counters || {};
    expect(counters['answer.received']).toBeGreaterThanOrEqual(1);
    expect(counters['question.start']).toBeGreaterThanOrEqual(1);
    expect(counters['reaction.broadcast']).toBeGreaterThanOrEqual(1);
  }, 15000);
});
