/// <reference types="jest" />
import 'reflect-metadata';
process.env.TIME_SCALE = '0.12';
process.env.REVEAL_DELAY_MS = '150';
process.env.METRICS_RESET_TOKEN = 'TEST_RESET_TOKEN';
import * as dotenv from 'dotenv';
dotenv.config({ path: process.cwd() + '/packages/backend/.env' });
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/modules/app.module';
import request from 'supertest';

let app: INestApplication;
let httpServer: any;

describe('Metrics protected reset (E2E)', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    httpServer = app.getHttpServer();
  });
  afterAll(async () => { await app.close(); });

  it('rejects reset without token', async () => {
    await request(httpServer).post('/metrics/reset').expect(401);
  });

  it('accepts reset with header token', async () => {
    const res = await request(httpServer).post('/metrics/reset').set('x-metrics-reset-token','TEST_RESET_TOKEN').expect(201).catch(()=>null);
    // Accept either 200 or 201 depending on Nest default; ensure body shows protected true
    const r = res || await request(httpServer).post('/metrics/reset').set('x-metrics-reset-token','TEST_RESET_TOKEN');
    expect([200,201]).toContain(r.status);
    expect(r.body.protected).toBe(true);
    expect(r.body.reset).toBe(true);
  });
});
