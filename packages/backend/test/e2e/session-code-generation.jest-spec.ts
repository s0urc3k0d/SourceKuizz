/// <reference types="jest" />
import 'reflect-metadata';
process.env.TIME_SCALE='0.1';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/modules/app.module';
import { PrismaService } from '../../src/modules/database/prisma.service';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';

let app: INestApplication; let httpServer:any;

describe('Session code auto-generation (E2E)', () => {
  beforeAll(async () => {
    const modRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modRef.createNestApplication();
    await app.init(); await app.listen(0); httpServer = app.getHttpServer();
    // cleanup DB
  const prisma = modRef.get(PrismaService);
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

  it('assigns a code when omitted and allows start flow', async () => {
    const reg = await request(httpServer).post('/auth/register').send({ username:'autocode', password:'secret123' }).expect(201);
    const token = reg.body.accessToken;
    const quiz = await request(httpServer).post('/quizzes').set('Authorization','Bearer '+token).send({ title:'Gen', description:'Auto' }).expect(201);
    const quizId = quiz.body.id;
    const q1 = await request(httpServer).post(`/quizzes/${quizId}/questions`).set('Authorization','Bearer '+token).send({ type:'mcq', prompt:'Q?', timeLimitMs:1500, options:[{label:'A',isCorrect:true},{label:'B',isCorrect:false}] }).expect(201);
    const addr = httpServer.address(); const port = typeof addr==='object'&&addr?addr.port:3000;
    const url = `http://127.0.0.1:${port}`;
    const sock:Socket = io(url,{ auth:{ token }, transports:['websocket'], forceNew:true });
    await new Promise<void>((res,rej)=>{ const t=setTimeout(()=>rej(new Error('connect timeout')),4000); sock.once('connect',()=>{clearTimeout(t);res();}); sock.once('connect_error',(e)=>{clearTimeout(t);rej(e);}); });
    let assignedCode:string|undefined; 
    sock.once('session_code_assigned', (p:any)=>{ assignedCode = p.code; });
    sock.emit('join_session', { quizId, nickname:'HostAutoCode' });
    const state:any = await new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('no state')),4000); sock.once('session_state',(s)=>{clearTimeout(t);res(s);}); });
    expect(state.code || assignedCode).toBeDefined();
    const code = state.code || assignedCode!;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    // Start question cycle
    sock.emit('start_question',{ code });
    await new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('no q start')),4000); sock.once('question_started',()=>{clearTimeout(t);res(null);}); });
    sock.disconnect();
  },15000);
});
