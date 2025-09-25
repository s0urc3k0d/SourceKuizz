import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDatabase } from '../utils/test-helpers';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

describe('Auth smoke', () => {
  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma as any);
  });
  afterAll(async () => { await ctx.app.close(); });

  it('registers a user', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'smokeuser', password: 'secret123' })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
  });
});
