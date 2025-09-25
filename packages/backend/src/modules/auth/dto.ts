import { z } from 'zod';

export const registerDto = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
});

export const loginDto = registerDto; // same shape

export type RegisterInput = z.infer<typeof registerDto>;
export type LoginInput = z.infer<typeof loginDto>;
