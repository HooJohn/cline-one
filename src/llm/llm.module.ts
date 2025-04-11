import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmAdapterService } from './llm-adapter.service';
import { DeepseekProvider } from './deepseek.provider';

@Module({
  imports: [],
  providers: [
    DeepseekProvider,
    {
      provide: 'LLM_PROVIDER',
      useExisting: DeepseekProvider
    },
    LlmAdapterService
  ],
  exports: [LlmAdapterService]
})
export class LlmModule {}
