import { Injectable } from '@nestjs/common';

@Injectable()
export class RequestContextMiddleware {
  use(req: any, _res: any, next: () => void) {
    (global as any).__lastHttpRequest = req;
    next();
  }
}
