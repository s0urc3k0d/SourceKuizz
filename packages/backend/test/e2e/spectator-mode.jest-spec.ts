/// <reference types="jest" />
import 'reflect-metadata';
process.env.TIME_SCALE = '0.12';
process.env.REVEAL_DELAY_MS = '180';
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

describe('Spectator mode (Jest)', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    prisma = moduleRef.get(PrismaService);
    httpServer = app.getHttpServer();
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
    try { const gw: any = app.get<any>('RealtimeGateway'); if (gw?.dispose) gw.dispose(); } catch {}
    await app.close();
  });

  it('allows joining as spectator and rejects answers; updates viewers.active gauge', async () => {
    const reg = await request(httpServer)
      .post('/auth/register')
      .send({ username: 'specuser', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken as string;

    const quizRes = await request(httpServer)
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Spec Quiz', description: 'spectators' })
      .expect(201);
    const quizId = quizRes.body.id as string;

    const qRes = await request(httpServer)
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({ type: 'mcq', prompt: 'S?', timeLimitMs: 1200, options: [ { label: 'A', isCorrect: true }, { label: 'B', isCorrect: false } ] })
      .expect(201);
    const questionId = qRes.body.id as string;
    const correctOptionId = qRes.body.options.find((o: any)=>o.isCorrect).id as string;

    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    const url = `http://127.0.0.1:${port}`;

    const player: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    const spectator: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });

    const connect = (s: Socket)=> new Promise<void>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('connect timeout')),4000); s.once('connect',()=>{clearTimeout(to);res();}); s.once('connect_error',(e)=>{clearTimeout(to);rej(e);});});
    await connect(player); await connect(spectator);

    const CODE = 'SPEC1';
    // Player joins normally
    player.emit('join_session', { code: CODE, quizId, nickname: 'P' });
    await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no player state')),3000); player.once('session_state',(s:any)=>{clearTimeout(to);res(s);}); });

    // Spectator joins as spectator
    const specStateP = new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no spectator state')),3000); spectator.once('session_state',(s:any)=>{clearTimeout(to);res(s);}); });
    spectator.emit('join_session', { code: CODE, quizId, nickname: 'Viewer', spectator: true });
    const specState = await specStateP;
    expect(specState.isSpectator).toBe(true);
    expect(specState.isHost).toBe(false);

    // Start question and attempt spectator answer
    player.emit('start_question', { code: CODE });
    await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no started')),3000); player.once('question_started',(d:any)=>{clearTimeout(to);res(d);}); });

    const ackPromise = new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no ack')),3000); spectator.once('answer_ack',(a:any)=>{clearTimeout(to);res(a);}); });
    spectator.emit('submit_answer', { questionId, optionId: correctOptionId, clientTs: Date.now(), code: CODE });
    const ack = await ackPromise;
    expect(ack.accepted).toBe(false);
    expect(ack.reason).toBe('spectator');

    // Metrics check for viewers.active >= 1
    const metricsRes = await request(httpServer).get('/metrics').expect(200);
    const counters = metricsRes.body.counters || {};
    expect(typeof counters['viewers.active']).toBe('number');
    expect(counters['viewers.active']).toBeGreaterThanOrEqual(1);

    // Prometheus exposition has gauge type for viewers.active
    const promRes = await request(httpServer).get('/metrics/prom').expect(200);
    expect(promRes.text).toMatch(/# TYPE sourcekuizz_viewers_active gauge/);

    player.disconnect(); spectator.disconnect();
  }, 20000);
});
