/// <reference types="jest" />
import 'reflect-metadata';
process.env.TIME_SCALE='0.2'; // 3000ms effectifs -> 600ms réels (approx)
process.env.REVEAL_DELAY_MS='400';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/modules/app.module';
import { PrismaService } from '../../src/modules/database/prisma.service';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';

let app: INestApplication; let httpServer:any;

describe('Late joiner remainingMs (E2E)', () => {
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init(); await app.listen(0); httpServer = app.getHttpServer();
    // DB clean
  const prisma = mod.get(PrismaService);
    await prisma.playerAnswer.deleteMany();
    await prisma.gamePlayer.deleteMany();
    await prisma.gameSession.deleteMany();
    await prisma.questionOption.deleteMany();
    await prisma.question.deleteMany();
    await prisma.quiz.deleteMany();
    if (prisma.authSession) await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
  });
  afterAll(async ()=>{ try { const gw:any = app.get<any>('RealtimeGateway'); if (gw?.dispose) gw.dispose(); } catch{}; await app.close(); });

  it('late joiner receives non-zero remainingMs during active question', async () => {
    const reg = await request(httpServer).post('/auth/register').send({ username:'late1', password:'secret123'}).expect(201);
    const token = reg.body.accessToken;
    const quiz = await request(httpServer).post('/quizzes').set('Authorization','Bearer '+token).send({ title:'Late', description:'Join' }).expect(201);
    const quizId = quiz.body.id;
  const q = await request(httpServer).post(`/quizzes/${quizId}/questions`).set('Authorization','Bearer '+token).send({ type:'mcq', prompt:'Q?', timeLimitMs:3000, options:[{label:'A',isCorrect:true},{label:'B',isCorrect:false}] }).expect(201);
    const addr = httpServer.address(); const port = typeof addr==='object'&&addr?addr.port:3000; const url = `http://127.0.0.1:${port}`;
    // Host socket
    const host:Socket = io(url,{ auth:{ token }, transports:['websocket'], forceNew:true });
    await new Promise<void>((res,rej)=>{ const t=setTimeout(()=>rej(new Error('host connect timeout')),4000); host.once('connect',()=>{clearTimeout(t);res();}); host.once('connect_error',(e)=>{clearTimeout(t);rej(e);}); });
    host.emit('join_session',{ quizId, nickname:'Host' });
    const state0:any = await new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('no initial state')),3000); host.once('session_state',(s)=>{clearTimeout(t);res(s);}); });
    const code = state0.code;
    // Start question
    host.emit('start_question',{ code });
    await new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('no question_started')),3000); host.once('question_started',()=>{clearTimeout(t);res(null);}); });
  // Attendre ~120ms (bien < 600ms réel après TIME_SCALE) pour garantir question encore active
  await new Promise(r=>setTimeout(r,120));
    // Late joiner
    const late:Socket = io(url,{ auth:{ token }, transports:['websocket'], forceNew:true });
    await new Promise<void>((res,rej)=>{ const t=setTimeout(()=>rej(new Error('late connect timeout')),4000); late.once('connect',()=>{clearTimeout(t);res();}); late.once('connect_error',(e)=>{clearTimeout(t);rej(e);}); });
    let joinState:any; 
    late.once('session_state',(s)=>{ joinState = s; });
    late.emit('join_session',{ code, quizId, nickname:'Late' });
    await new Promise(r=>setTimeout(r,200));
    expect(joinState).toBeDefined();
    expect(joinState.status).toBe('question');
    // remainingMs doit être < timeLimitMs et > 0
    expect(joinState.remainingMs).toBeGreaterThan(0);
    expect(joinState.remainingMs).toBeLessThan(3000);
    host.disconnect(); late.disconnect();
  }, 18000);
});
