import 'reflect-metadata';
process.env.TIME_SCALE = '0.12';
process.env.REVEAL_DELAY_MS = '120';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/modules/app.module';
import request from 'supertest';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { io, Socket } from 'socket.io-client';

describe('Metrics durations (E2E)', () => {
  let app: INestApplication; let httpServer: any; let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    await app.listen(0);
    prisma = mod.get(PrismaService);
    const p: any = prisma;
    await p.playerAnswer.deleteMany();
    await p.gamePlayer.deleteMany();
    await p.gameSession.deleteMany();
    await p.questionOption.deleteMany();
    await p.question.deleteMany();
    await p.quiz.deleteMany();
    if (p.authSession) await p.authSession.deleteMany();
    await p.user.deleteMany();
    httpServer = app.getHttpServer();
  }, 20000);

  afterAll(async () => { try { await app.close(); } catch {} });

  it('emits question/session duration histograms after a finished session', async () => {
    // Register + quiz + one question
    const reg = await request(httpServer).post('/auth/register').send({ username:'mtr', password:'secret123' }).expect(201);
    const token = reg.body.accessToken as string;
    const quiz = await request(httpServer).post('/quizzes').set('Authorization','Bearer '+token)
      .send({ title:'Metrics Quiz', description:'M' }).expect(201);
    const quizId = quiz.body.id as string;
    const q = await request(httpServer).post(`/quizzes/${quizId}/questions`).set('Authorization','Bearer '+token)
      .send({ type:'mcq', prompt:'Ping?', timeLimitMs:1000, options:[{label:'Pong', isCorrect:true},{label:'No', isCorrect:false}] }).expect(201);

    // Connect socket
    const addr = httpServer.address(); const port = typeof addr==='object' && addr? addr.port : 3000; const url = `http://127.0.0.1:${port}`;
    const client: Socket = await new Promise((resolve, reject)=>{
      const c = io(url, { auth:{ token }, transports:['websocket'], forceNew:true });
      c.once('connect', ()=> resolve(c)); c.once('connect_error', reject);
    });

    client.emit('join_session', { code:'MTRX1', quizId, nickname:'Host' });
    await new Promise(r=>client.once('session_state', r));
    client.emit('start_question', { code:'MTRX1' });
    await new Promise(r=>client.once('question_started', r));
    const fin = await new Promise<any>(resolve => client.once('session_finished', resolve));
    expect(Array.isArray(fin.final)).toBe(true);
    client.disconnect();

    // Check Prometheus output
    const prom = await request(httpServer).get('/metrics/prom').expect(200);
    const text = prom.text;
    expect(text).toMatch(/sourcekuizz_question_duration_seconds_bucket\{le="\+Inf"\} \d+/);
    expect(text).toMatch(/sourcekuizz_question_duration_seconds_count \d+/);
    expect(text).toMatch(/sourcekuizz_session_duration_seconds_count \d+/);
  }, 20000);
});
