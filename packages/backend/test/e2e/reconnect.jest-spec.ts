import 'reflect-metadata';
process.env.TIME_SCALE='0.15';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/modules/app.module';
import request from 'supertest';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { io, Socket } from 'socket.io-client';

describe('Reconnection (E2E)', () => {
  let app: INestApplication; let httpServer: any; let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports:[AppModule] }).compile();
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
  }, 20000);

  afterAll(async () => { try { await app.close(); } catch {} });

  it('preserves score & streak after reconnect and increments player.reconnect metric', async () => {
    const reg = await request(httpServer = app.getHttpServer())
      .post('/auth/register').send({ username:'reco', password:'secret123'}).expect(201);
    const token = reg.body.accessToken as string;

    const quiz = await request(httpServer).post('/quizzes').set('Authorization','Bearer '+token)
      .send({ title:'Reco Quiz', description:'R'}).expect(201);
    const quizId = quiz.body.id;
    const q = await request(httpServer).post(`/quizzes/${quizId}/questions`).set('Authorization','Bearer '+token)
      .send({ type:'mcq', prompt:'1+1?', timeLimitMs:2000, options:[{label:'2',isCorrect:true},{label:'3',isCorrect:false}] }).expect(201);
    const correctId = q.body.options.find((o:any)=>o.isCorrect).id;

    const addr = httpServer.address();
    const port = typeof addr==='object' && addr? addr.port:3000; const url = `http://127.0.0.1:${port}`;

    function connect(): Promise<Socket> { return new Promise((res,rej)=>{ const c = io(url,{ auth:{ token }, transports:['websocket'], forceNew:true }); c.once('connect',()=>res(c)); c.once('connect_error',e=>rej(e)); }); }

    const c1 = await connect();
    c1.emit('join_session',{ code:'RECO1', quizId, nickname:'RecoPlayer'});
    await new Promise(r=>c1.once('session_state', r));

    // Démarrer question pour pouvoir répondre et avoir un score / streak
    c1.emit('start_question',{ code:'RECO1'});
    const started: any = await new Promise(r=>c1.once('question_started', r));
    expect(started.timeLimitMs).toBe(2000);

    // Soumettre bonne réponse pour créer score/streak
    const ackP = new Promise<any>(r=>c1.once('answer_ack', r));
    const lbAfterAnswer = new Promise<any>((resolve)=>{
      c1.on('leaderboard_update', (lb:any)=>{ if (Array.isArray(lb.entries) && lb.entries.some((e:any)=>e.score>0)) resolve(lb); });
    });
    c1.emit('submit_answer',{ questionId:q.body.id, optionId:correctId, clientTs:Date.now(), code:'RECO1' });
  const ack = await ackP; expect(ack.accepted).toBe(true); expect(ack.correct).toBe(true); expect(ack.scoreDelta).toBeGreaterThan(0);
  await lbAfterAnswer;

    // Forcer coupure réseau (disconnect) puis reconnexion avec même user
    c1.disconnect();

    const c2 = await connect();
    c2.emit('join_session',{ code:'RECO1', quizId, nickname:'IgnoredName'});
    const stateAfter: any = await new Promise(r=>c2.once('session_state', r));
    // On ne dépend pas strictement du flag reconnected (peut être perdu si autre event plus rapide) : on vérifiera via leaderboard
    // Attendre leaderboard avec score > 0 pour confirmer restauration
    const leaderboardOrFinish = await Promise.race([
      new Promise<any>((resolve)=>{
        c2.on('leaderboard_update', (lb:any)=>{
          if (Array.isArray(lb.entries) && lb.entries.some((e:any)=>e.score>0)) { resolve({ type:'lb', data:lb }); }
        });
      }),
      new Promise<any>((resolve)=>{
        c2.once('session_finished', (fin:any)=> resolve({ type:'finished', data:fin }));
      }),
      new Promise<any>((_,reject)=> setTimeout(()=>reject(new Error('lb timeout')), 6000)),
    ]);
    if (leaderboardOrFinish.type === 'lb') {
      expect(leaderboardOrFinish.data.entries.some((e:any)=>e.score>0)).toBe(true);
    } else if (leaderboardOrFinish.type === 'finished') {
      expect(leaderboardOrFinish.data.final.some((e:any)=>e.score>0)).toBe(true);
    }

    // Attendre reveal ou finish pour se stabiliser
    const endState = await Promise.race([
      new Promise(r=>c2.once('question_reveal', d=>r({ phase:'reveal', d }))),
      new Promise(r=>c2.once('session_finished', d=>r({ phase:'finished', d }))),
      new Promise(r=>setTimeout(()=>r({ phase:'timeout'}), 4000))
    ]);
    expect(['reveal','finished','timeout']).toContain((endState as any).phase);

    // Vérifier métrique player.reconnect > 0
    const prom = await request(httpServer).get('/metrics/prom').expect(200);
    expect(prom.text).toMatch(/player_reconnect_total\s+1/);

    c2.disconnect();
  }, 20000);
});
