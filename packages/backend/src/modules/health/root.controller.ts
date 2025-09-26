import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  @Get()
  root() {
    return {
      name: 'SourceKuizz Backend',
      status: 'ok',
      endpoints: [
        '/',
        '/health',
        '/metrics',
        '/metrics/prom',
        '/sessions/ensure (POST, auth)',
        '/sessions/:code',
        '/sessions/:code/current-question',
      ],
    };
  }
}
