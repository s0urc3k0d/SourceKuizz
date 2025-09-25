// ARCHIVÉ: Test d'introspection DI (Vitest) conservé pour analyse future
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp } from '../utils/test-helpers';
import { AuthService } from '../../src/modules/auth/auth.service';

let ctx: Awaited<ReturnType<typeof createTestApp>>;

describe('LEGACY DI introspection', () => {
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => { await ctx.app.close(); });
  it('resolves AuthService from container', () => {
    const resolved = ctx.app.get(AuthService);
    expect(resolved).toBeInstanceOf(AuthService);
  });
});
