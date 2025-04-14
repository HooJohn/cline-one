import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmAdapterService } from './llm-adapter.service';
import { LLMAdapter } from './llm.provider';

@Module({
  imports: [],
  providers: [
    LLMAdapter,
    {
      provide: 'LLM_PROVIDER',
      useExisting: LLMAdapter
    },
    LlmAdapterService
  ],
  exports: [LlmAdapterService, LLMAdapter, 'LLM_PROVIDER']
})
export class LlmModule {}
