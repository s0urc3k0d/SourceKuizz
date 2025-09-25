import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = auth.substring(7);
    try {
      const payload = await this.jwt.verifyAsync(token);
      req.user = { id: payload.sub, username: payload.username };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
