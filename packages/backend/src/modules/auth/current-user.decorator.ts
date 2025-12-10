import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../types';

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as AuthenticatedUser | undefined;
});
