import { Module, Global } from '@nestjs/common';
import { StructuredLoggerService } from './structured-logger.service';

@Global()
@Module({
  providers: [
    {
      provide: StructuredLoggerService,
      useFactory: () => new StructuredLoggerService('SourceKuizz'),
    },
  ],
  exports: [StructuredLoggerService],
})
export class CommonModule {}
