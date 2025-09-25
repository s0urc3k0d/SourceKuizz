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
import { io, Socket } from 'socket.io-client';

let app: INestApplication;
let httpServer: any;

describe('Leaderboard REST', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    httpServer = app.getHttpServer();
  });

  afterAll(async () => { await app.close(); });

  it('returns session leaderboard and global leaderboard', async () => {
    // register user
    const reg = await request(httpServer).post('/auth/register').send({ username: 'leaduser', password: 'secret123' }).expect(201);
    const token = reg.body.accessToken as string;
    // quiz + question
    const quiz = await request(httpServer).post('/quizzes').set('Authorization','Bearer '+token).send({ title: 'LB', description: 'lb' }).expect(201);
    const quizId = quiz.body.id;
    const qRes = await request(httpServer).post(`/quizzes/${quizId}/questions`).set('Authorization','Bearer '+token).send({ type: 'mcq', prompt: 'X?', timeLimitMs: 1200, options: [ { label: 'A', isCorrect: true }, { label: 'B', isCorrect: false } ] }).expect(201);
    const questionId = qRes.body.id; const correctOpt = qRes.body.options.find((o:any)=>o.isCorrect).id;
    // sockets
    const addr = httpServer.address(); const port = typeof addr === 'object' && addr ? addr.port : 3000; const url = `http://127.0.0.1:${port}`;
    const s1: Socket = io(url, { auth: { token }, transports:['websocket'], forceNew:true });
    const s2: Socket = io(url, { auth: { token }, transports:['websocket'], forceNew:true });
    const connect = (s: Socket)=> new Promise<void>((res,rej)=>{ const to=setTimeout(()=>rej(new Error('connect timeout')),4000); s.once('connect',()=>{clearTimeout(to);res();}); s.once('connect_error',(e)=>{clearTimeout(to);rej(e);}); });
    await connect(s1); await connect(s2);
    const CODE='LB1';
    s1.emit('join_session', { code: CODE, quizId, nickname: 'Alpha' });
    await new Promise(r=>s1.once('session_state', ()=>r(null)));
    s2.emit('join_session', { code: CODE, quizId, nickname: 'Beta' });
    await new Promise(r=>s2.once('session_state', ()=>r(null)));
    // start question by host (s1)
    s1.emit('start_question', { code: CODE });
    await new Promise(r=>s1.once('question_started', ()=>r(null)));
    // answer: make one small delay for second to reduce score
    s1.emit('submit_answer', { questionId, optionId: correctOpt, clientTs: Date.now(), code: CODE });
    await new Promise(r=>setTimeout(r,50));
    s2.emit('submit_answer', { questionId, optionId: correctOpt, clientTs: Date.now(), code: CODE });
    await new Promise(r=>s2.once('answer_ack', ()=>r(null)));
    await new Promise(r=>setTimeout(r,120)); // allow persistence
    s1.disconnect(); s2.disconnect();
    const sessionLb = await request(httpServer).get(`/sessions/${CODE}/leaderboard`).expect(200);
    expect(sessionLb.body.code).toBe(CODE);
    expect(sessionLb.body.entries.length).toBe(2);
    expect(sessionLb.body.entries[0].score).toBeGreaterThan(sessionLb.body.entries[1].score);
    const globalLb = await request(httpServer).get('/leaderboard?limit=5').expect(200);
    expect(globalLb.body.entries.length).toBeGreaterThan(0);
  }, 20000);
});
