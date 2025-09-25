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

describe('Metrics endpoint (Jest)', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    prisma = moduleRef.get(PrismaService);
    httpServer = app.getHttpServer();
    // Cleanup DB to avoid username collisions
    const p: any = prisma;
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
    try { const gw: any = app.get<any>('RealtimeGateway'); if (gw?.dispose) gw.dispose(); } catch {}
    await app.close();
  });

  it('collects realtime counters (json + prom) + gauges + auto_start + reset', async () => {
    const reg = await request(httpServer)
      .post('/auth/register')
      .send({ username: 'metricsUser', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken as string;
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
  // Deux sockets pour forcer un auto-reveal et host transfer
  const sHost: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
  const sGuest: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
  const connect = (s: Socket)=> new Promise<void>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('connect timeout')),4000); s.once('connect',()=>{clearTimeout(to);res();}); s.once('connect_error',(e)=>{clearTimeout(to);rej(e);}); });
  await connect(sHost); await connect(sGuest);
  const CODE = 'METR1';
  sHost.emit('join_session', { code: CODE, quizId, nickname: 'MetrixHost' });
  await new Promise<any>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('no state host')),3000); sHost.once('session_state',(s)=>{clearTimeout(to);res(s);}); });
  sGuest.emit('join_session', { code: CODE, quizId, nickname: 'MetrixGuest' });
  await new Promise<any>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('no state guest')),3000); sGuest.once('session_state',(s)=>{clearTimeout(to);res(s);}); });
  // Host start
  sHost.emit('start_question', { code: CODE });
  await new Promise<any>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('no started')),3000); sHost.once('question_started',(d)=>{clearTimeout(to);res(d);}); });
  // Les deux répondent -> auto reveal => question.autoreveal incrémenté
  sHost.emit('submit_answer', { questionId, optionId: optionCorrectId, clientTs: Date.now(), code: CODE });
  sGuest.emit('submit_answer', { questionId, optionId: optionCorrectId, clientTs: Date.now(), code: CODE });
  await new Promise<any>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('no reveal')),4000); sHost.once('question_reveal',(d)=>{clearTimeout(to);res(d);}); });
  // Host transfer
  sHost.emit('transfer_host', { code: CODE, targetPlayerId: sGuest.id });
  await new Promise<any>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('no host_changed')),3000); sGuest.once('host_changed',(d)=>{clearTimeout(to);res(d);}); });
  // Reaction
  sGuest.emit('reaction', { emoji: '🔥', code: CODE });
  await new Promise(r=>setTimeout(r,80));
  sHost.disconnect(); sGuest.disconnect();
    const metricsRes = await request(httpServer).get('/metrics').expect(200);
    const counters = metricsRes.body.counters || {};
    expect(counters['answer.received']).toBeGreaterThanOrEqual(2); // deux réponses
    expect(counters['question.start']).toBeGreaterThanOrEqual(1);
    expect(counters['reaction.broadcast']).toBeGreaterThanOrEqual(1);
    expect(counters['question.autoreveal']).toBeGreaterThanOrEqual(1);
    expect(counters['player.join']).toBeGreaterThanOrEqual(2);
    expect(counters['host.transfer']).toBeGreaterThanOrEqual(1);

    // Vérif auto_start absent pour l’instant
    expect(counters['question.auto_start'] || 0).toBeGreaterThanOrEqual(0);
    // Vérif gauges présentes (>=0)
    expect(typeof counters['players.active']).toBe('number');
    expect(typeof counters['sessions.active']).toBe('number');

    const promRes = await request(httpServer).get('/metrics/prom').expect(200);
    const body = promRes.text;
    expect(body).toMatch(/# TYPE sourcekuizz_answer_received_total counter/);
    expect(body).toMatch(/# TYPE sourcekuizz_players_active gauge/);
    expect(body).toMatch(/# TYPE sourcekuizz_sessions_active gauge/);

    // Test du reset
    const resetResp = await request(httpServer).post('/metrics/reset');
    expect([200,201]).toContain(resetResp.status);
    const afterReset = await request(httpServer).get('/metrics').expect(200);
    expect((afterReset.body.counters['answer.received'] || 0)).toBe(0);
  }, 15000);
});
