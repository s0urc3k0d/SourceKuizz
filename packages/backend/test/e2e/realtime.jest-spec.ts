/// <reference types="jest" />
import 'reflect-metadata';
process.env.TIME_SCALE = '0.12'; // accélère timers (1200ms -> ~144ms)
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

describe('Realtime WebSocket integration (Jest)', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    // Lier sur un port éphémère pour permettre la connexion réseau Socket.IO
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
    // Tenter de disposer proprement la gateway pour éviter timers persistants
    try {
      const gw: any = app.get<any>('RealtimeGateway');
      if (gw && typeof gw.dispose === 'function') gw.dispose();
    } catch { /* ignore */ }
    await app.close();
  });

  it('joins session and submits a valid answer', async () => {
    // 1. Register user & create quiz + question
    const reg = await request(httpServer)
      .post('/auth/register')
      .send({ username: 'rtuser', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken as string;

    const quizRes = await request(httpServer)
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'RT Quiz', description: 'Realtime' })
      .expect(201);
    const quizId = quizRes.body.id as string;

    const qRes = await request(httpServer)
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({
        type: 'mcq',
        prompt: 'Capital of France?',
        timeLimitMs: 3000,
        options: [
          { label: 'Paris', isCorrect: true },
          { label: 'Lyon', isCorrect: false },
        ],
      })
      .expect(201);
    const questionId = qRes.body.id as string;
    const optionCorrectId = qRes.body.options.find((o: any) => o.isCorrect).id as string;

    // 2. Connect socket with JWT
  // Récupérer port réel du serveur de test
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const url = `http://127.0.0.1:${port}`;
  // eslint-disable-next-line no-console
  console.log('WS test connecting to', url);
    const client: Socket = io(url, {
      auth: { token: token },
      forceNew: true,
      transports: ['websocket'],
    });

    const debugEvents: Record<string, any[]> = { errors: [] };
    client.on('connect_error', (e) => { debugEvents.errors.push(['connect_error', e?.message]); });
    client.on('error_generic', (e) => { debugEvents.errors.push(['error_generic', e]); });
    client.on('disconnect', (reason) => { if (reason !== 'io client disconnect') debugEvents.errors.push(['disconnect', reason]); });

    // Helpers for awaiting events
    function once<T = any>(ev: string, timeoutMs = 5000): Promise<T> {
      return new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('Timeout waiting ' + ev)), timeoutMs);
        client.once(ev, (data: T) => { clearTimeout(to); resolve(data); });
      });
    }

    // Attendre connexion
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('Timeout connect ' + url)), 5000);
      client.once('connect', () => { clearTimeout(to); resolve(); });
      client.once('connect_error', (e) => { clearTimeout(to); reject(new Error('connect_error: ' + e?.message)); });
    });

    // 3. Join session
    const sessionCode = 'CODE1';
    client.emit('join_session', { code: sessionCode, quizId, nickname: 'PlayerRT' });
    const state = await once('session_state');
    expect(state.status).toBe('lobby');
    expect(state.totalQuestions).toBe(1);

    // 4. Submit answer
    // Consommer la première mise à jour leaderboard initiale (lobby)
    try {
      const initialLb = await once('leaderboard_update', 500);
      // eslint-disable-next-line no-console
      console.log('Initial leaderboard received (lobby)', initialLb);
    } catch { /* ignore if not arrived yet */ }

    const ackPromise = once('answer_ack');
    const leaderboardPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting leaderboard_update (post answer)')), 5000);
      const handler = (lb: any) => {
        if (Array.isArray(lb.entries) && lb.entries.some((e: any) => e.score > 0)) {
          clearTimeout(timeout); resolve(lb); client.off('leaderboard_update', handler);
        }
      };
      client.on('leaderboard_update', handler);
    });

    client.emit('submit_answer', { questionId, optionId: optionCorrectId, clientTs: Date.now(), code: sessionCode });
    const ack = await ackPromise;
    expect(ack.accepted).toBe(true);
    expect(ack.correct).toBe(true);
    expect(ack.scoreDelta).toBeGreaterThan(0);

    const leaderboard = await leaderboardPromise;
    expect(Array.isArray(leaderboard.entries)).toBe(true);
    expect(leaderboard.entries[0].score).toBeGreaterThan(0);

    // Double answer rejected
    client.emit('submit_answer', { questionId, optionId: optionCorrectId, clientTs: Date.now(), code: sessionCode });
    const ack2 = await once('answer_ack');
    expect(ack2.accepted).toBe(false);
    expect(ack2.reason).toBe('already_answered');

    client.disconnect();
    if (debugEvents.errors.length) {
      // eslint-disable-next-line no-console
      console.log('WebSocket debug events:', debugEvents.errors);
    }
  }, 20000);

  it('orchestrates question start -> reveal -> next/finish', async () => {
    // Préparation user & quiz à 2 questions
    const reg = await request(httpServer)
      .post('/auth/register')
      .send({ username: 'orchestrator', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken as string;

    const quizRes = await request(httpServer)
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Orch Quiz', description: 'Flow' })
      .expect(201);
    const quizId = quizRes.body.id as string;

    // Deux questions
    const q1 = await request(httpServer)
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({
        type: 'mcq', prompt: '1+1?', timeLimitMs: 1200, options: [ { label: '2', isCorrect: true }, { label: '3', isCorrect: false } ]
      }).expect(201);
    const q2 = await request(httpServer)
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({
        type: 'mcq', prompt: '2+2?', timeLimitMs: 1200, options: [ { label: '4', isCorrect: true }, { label: '5', isCorrect: false } ]
      }).expect(201);

    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    const url = `http://127.0.0.1:${port}`;
    const client: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });

    function onceEv<T=any>(ev: string, timeout=3000): Promise<T> {
      return new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('Timeout '+ev)), timeout);
        client.once(ev, (d: any) => { clearTimeout(to); resolve(d); });
      });
    }

    await new Promise<void>((res, rej)=>{
      const to = setTimeout(()=>rej(new Error('connect timeout')), 4000);
      client.once('connect', ()=>{ clearTimeout(to); res(); });
      client.once('connect_error', (e)=>{ clearTimeout(to); rej(e); });
    });

    client.emit('join_session', { code: 'ORCH1', quizId, nickname: 'Host' });
    await onceEv('session_state');

    // Start question 1
    client.emit('start_question', { code: 'ORCH1' });
    const started = await onceEv('question_started');
    expect(started.questionId).toBe(q1.body.id);

    // Attendre reveal automatique
    const reveal1 = await onceEv('question_reveal', 4000);
    expect(reveal1.questionId).toBe(q1.body.id);
    expect(Array.isArray(reveal1.correctOptionIds)).toBe(true);

    // Attendre retour lobby pour question 2
    const state2 = await onceEv('session_state', 4000);
    expect(state2.questionIndex).toBe(1);
    expect(state2.status).toBe('lobby');

    // Démarrer question 2 puis laisser finir
    client.emit('start_question', { code: 'ORCH1' });
    const started2 = await onceEv('question_started');
    expect(started2.questionId).toBe(q2.body.id);

    const reveal2 = await onceEv('question_reveal', 4000);
    expect(reveal2.questionId).toBe(q2.body.id);

    const finished = await onceEv('session_finished', 4000);
    expect(Array.isArray(finished.final)).toBe(true);

    client.disconnect();
  }, 20000);

  it('enforces host start and auto-reveal when all players answered', async () => {
    // User + quiz
    const reg = await request(httpServer)
      .post('/auth/register')
      .send({ username: 'multiplayer', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const quizRes = await request(httpServer)
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Multi Quiz', description: 'Multi' })
      .expect(201);
    const quizId = quizRes.body.id as string;
    const q1 = await request(httpServer)
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({ type: 'mcq', prompt: 'Color of sky?', timeLimitMs: 2000, options: [ { label: 'Blue', isCorrect: true }, { label: 'Red', isCorrect: false } ] })
      .expect(201);
    const optionCorrectId = q1.body.options.find((o: any)=>o.isCorrect).id as string;

    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    const url = `http://127.0.0.1:${port}`;
    const hostSocket: any = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    const p2Socket: any = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });

    function waitConnect(s: any) { return new Promise<void>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('timeout connect')),4000); s.once('connect',()=>{clearTimeout(to);res();}); s.once('connect_error',(e:any)=>{clearTimeout(to);rej(e);}); }); }
    await waitConnect(hostSocket); await waitConnect(p2Socket);

    const code = 'MULTI1';
    // Joindre d'abord le host et attendre son state
    hostSocket.emit('join_session', { code, quizId, nickname: 'Host1' });
    const hostState = await new Promise<any>((resolve, reject)=>{ const to=setTimeout(()=>reject(new Error('timeout host state')),3000); hostSocket.once('session_state',(s:any)=>{clearTimeout(to); resolve(s);}); });
    expect(hostState.isHost).toBe(true);
    // Puis rejoindre le second joueur et attendre son state (devrait être non-host)
    p2Socket.emit('join_session', { code, quizId, nickname: 'Guest1' });
    const guestState = await new Promise<any>((resolve, reject)=>{ const to=setTimeout(()=>reject(new Error('timeout guest state')),3000); p2Socket.once('session_state',(s:any)=>{clearTimeout(to); resolve(s);}); });
    expect(guestState.isHost).toBe(false);

    // p2 tente de démarrer -> rejet (attendre avec timeout explicite)
    const rejectPromise = new Promise<any>((resolve, reject) => {
      const to = setTimeout(()=>reject(new Error('no rejection received')), 4000);
      const handler = (payload: any) => { clearTimeout(to); resolve(payload); };
      p2Socket.once('start_question_rejected', handler);
      // Par sécurité écouter aussi sur hostSocket (au cas improbable de mauvais routage)
      hostSocket.once('start_question_rejected', handler);
    });
    p2Socket.emit('start_question', { code });
    const rej = await rejectPromise;
    expect(rej.code).toBe('not_host');

    // host démarre
    const startedP = new Promise<any>((resolve)=>hostSocket.once('question_started', resolve));
    hostSocket.emit('start_question', { code });
    const started = await startedP;
    expect(started.questionId).toBe(q1.body.id);

    // Les deux joueurs répondent rapidement -> auto-reveal
    const revealPromise = new Promise<any>((resolve, reject)=>{
      const to = setTimeout(()=>reject(new Error('no reveal')), 4000);
      hostSocket.once('question_reveal', (d: any)=>{ clearTimeout(to); resolve(d); });
    });
    // Réponses quasi simultanées
    hostSocket.emit('submit_answer', { questionId: q1.body.id, optionId: optionCorrectId, clientTs: Date.now(), code });
    p2Socket.emit('submit_answer', { questionId: q1.body.id, optionId: optionCorrectId, clientTs: Date.now(), code });
    const reveal = await revealPromise; // auto reveal
    expect(reveal.questionId).toBe(q1.body.id);

    hostSocket.disconnect();
    p2Socket.disconnect();
  }, 20000);

  it('persists session, player and answer in database', async () => {
    const reg = await request(httpServer)
      .post('/auth/register')
      .send({ username: 'persistuser', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken as string;

    const quizRes = await request(httpServer)
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Persist Quiz', description: 'DB Check' })
      .expect(201);
    const quizId = quizRes.body.id as string;

    const qRes = await request(httpServer)
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({
        type: 'mcq',
        prompt: '2+3?',
        timeLimitMs: 2500,
        options: [ { label: '5', isCorrect: true }, { label: '4', isCorrect: false } ]
      })
      .expect(201);
    const questionId = qRes.body.id as string;
    const correctOptionId = qRes.body.options.find((o: any)=>o.isCorrect).id as string;

    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    const url = `http://127.0.0.1:${port}`;
    const client: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });

    await new Promise<void>((res, rej)=>{
      const to = setTimeout(()=>rej(new Error('ws connect timeout')), 4000);
      client.once('connect', ()=>{ clearTimeout(to); res(); });
      client.once('connect_error', (e)=>{ clearTimeout(to); rej(e); });
    });

    const sessionCode = 'PERS1';
    client.emit('join_session', { code: sessionCode, quizId, nickname: 'PersPlayer' });
    await new Promise<any>((resolve, reject)=>{ const to=setTimeout(()=>reject(new Error('no session_state')),3000); client.once('session_state',(s:any)=>{clearTimeout(to); resolve(s);}); });

    const ackPromise = new Promise<any>((resolve, reject)=>{ const to=setTimeout(()=>reject(new Error('no ack')),3000); client.once('answer_ack',(a:any)=>{clearTimeout(to); resolve(a);}); });
    client.emit('submit_answer', { questionId, optionId: correctOptionId, clientTs: Date.now(), code: sessionCode });
    const ack = await ackPromise;
    expect(ack.accepted).toBe(true);
    expect(ack.correct).toBe(true);

    // Petite attente pour laisser l’upsert s’exécuter
    await new Promise(r=>setTimeout(r,100));

    const sessionDb = await prisma.gameSession.findUnique({ where: { code: sessionCode } });
    expect(sessionDb).toBeTruthy();
  const gamePlayer = await prisma.gamePlayer.findFirst({ where: { sessionId: sessionDb!.id, nickname: 'PersPlayer' }, select: { id: true, score: true } });
  expect(gamePlayer).toBeTruthy();
  // runtime assertions (score doit être > 0)
  expect((gamePlayer as any).score).toBeGreaterThan(0);
  const answer = await prisma.playerAnswer.findFirst({ where: { playerId: (gamePlayer as any).id, questionId }, select: { id: true, correct: true, optionId: true, timeMs: true, uniqueKey: true, playerId: true } });
  expect(answer).toBeTruthy();
  expect((answer as any).correct).toBe(true);
  expect((answer as any).optionId).toBe(correctOptionId);
  expect((answer as any).timeMs).toBeGreaterThanOrEqual(0);
  expect(((answer as any).uniqueKey as string).startsWith((gamePlayer as any).id + ':')).toBe(true);

    client.disconnect();
  }, 15000);

  it('rejects join on quiz mismatch for existing session code', async () => {
    const reg = await request(httpServer)
      .post('/auth/register')
      .send({ username: 'mismatchUser', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken as string;

    // Créer deux quizzes
    const qz1 = await request(httpServer)
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Quiz A', description: 'A' })
      .expect(201);
    const quizA = qz1.body.id as string;
    const qz2 = await request(httpServer)
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Quiz B', description: 'B' })
      .expect(201);
    const quizB = qz2.body.id as string;

    // Ajouter question à chaque
    await request(httpServer)
      .post(`/quizzes/${quizA}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({ type: 'mcq', prompt: 'A?', timeLimitMs: 1200, options: [ { label: '1', isCorrect: true }, { label: 'X', isCorrect: false } ] })
      .expect(201);
    await request(httpServer)
      .post(`/quizzes/${quizB}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({ type: 'mcq', prompt: 'B?', timeLimitMs: 1200, options: [ { label: '2', isCorrect: true }, { label: 'Y', isCorrect: false } ] })
      .expect(201);

    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    const url = `http://127.0.0.1:${port}`;
    const s1: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    const s2: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });

    function waitConnect(sock: Socket) { return new Promise<void>((res, rej)=>{ const to=setTimeout(()=>rej(new Error('connect timeout')), 4000); sock.once('connect',()=>{clearTimeout(to); res();}); sock.once('connect_error',(e)=>{clearTimeout(to); rej(e);}); }); }
    await waitConnect(s1); await waitConnect(s2);

    const CODE = 'MISMATCH1';
    // Premier join avec quizA
    const statePromise = new Promise<any>((resolve, reject)=>{ const to=setTimeout(()=>reject(new Error('no state first join')),3000); s1.once('session_state',(d)=>{clearTimeout(to); resolve(d);}); });
    s1.emit('join_session', { code: CODE, quizId: quizA, nickname: 'A1' });
    await statePromise;

    // Second join avec quizB attendu rejet
    const rejectPromise = new Promise<any>((resolve, reject)=>{ const to=setTimeout(()=>reject(new Error('no reject')),3000); s2.once('join_rejected',(d)=>{clearTimeout(to); resolve(d);}); });
    s2.emit('join_session', { code: CODE, quizId: quizB, nickname: 'B1' });
    const rej = await rejectPromise;
    expect(rej.code).toBe('quiz_mismatch');

    // Vérifier qu'aucun session_state n'est venu pour le second socket
    let gotState = false;
    s2.once('session_state', ()=>{ gotState = true; });
    await new Promise(r=>setTimeout(r,500));
    expect(gotState).toBe(false);

    s1.disconnect();
    s2.disconnect();
  }, 15000);

  it('supports host transfer and rate limits reactions', async () => {
    const reg = await request(httpServer)
      .post('/auth/register')
      .send({ username: 'hostTransfer', password: 'secret123' })
      .expect(201);
    const token = reg.body.accessToken as string;
    const quizRes = await request(httpServer)
      .post('/quizzes')
      .set('Authorization', 'Bearer ' + token)
      .send({ title: 'Host Transfer', description: 'HT' })
      .expect(201);
    const quizId = quizRes.body.id as string;
    await request(httpServer)
      .post(`/quizzes/${quizId}/questions`)
      .set('Authorization', 'Bearer ' + token)
      .send({ type: 'mcq', prompt: 'HT?', timeLimitMs: 1500, options: [ { label: 'Yes', isCorrect: true }, { label: 'No', isCorrect: false } ] })
      .expect(201);
    const address = httpServer.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    const url = `http://127.0.0.1:${port}`;
    const sHost: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    const sGuest: Socket = io(url, { auth: { token }, transports: ['websocket'], forceNew: true });
    const connect = (s: Socket)=> new Promise<void>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('connect timeout')),4000); s.once('connect',()=>{clearTimeout(to);res();}); s.once('connect_error',(e)=>{clearTimeout(to);rej(e);});});
    await connect(sHost); await connect(sGuest);
    const CODE = 'HOSTTR1';
    sHost.emit('join_session', { code: CODE, quizId, nickname: 'Alpha' });
    await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no host state')),3000); sHost.once('session_state',(s:any)=>{clearTimeout(to);res(s);}); });
    sGuest.emit('join_session', { code: CODE, quizId, nickname: 'Beta' });
    const guestState = await new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no guest state')),3000); sGuest.once('session_state',(s:any)=>{clearTimeout(to);res(s);}); });
    expect(guestState.isHost).toBe(false);
    const hostChanged = new Promise<any>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('no host_changed')),3000); sGuest.once('host_changed',(d:any)=>{clearTimeout(to);res(d);}); });
    sHost.emit('transfer_host', { code: CODE, targetPlayerId: sGuest.id });
    const hc = await hostChanged; expect(hc.hostId).toBe(sGuest.id);
    // Rate limiter reactions
    let rejected = 0; sGuest.on('reaction_rejected', ()=>{ rejected++; });
    for (let i=0;i<10;i++) sGuest.emit('reaction', { emoji: '⭐', code: CODE });
    await new Promise(r=>setTimeout(r,400));
    expect(rejected).toBeGreaterThan(0);
    sHost.disconnect(); sGuest.disconnect();
  }, 15000);
});
