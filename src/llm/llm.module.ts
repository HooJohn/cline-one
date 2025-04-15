import { Module, forwardRef } from '@nestjs/common';
import { LlmAdapterService } from './llm-adapter.service';
import { LlmRouterService } from './llm-router.service';
import { DeepseekProvider } from './providers/deepseek.provider';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [
    forwardRef(() => CoreModule), // 使用forwardRef解决循环依赖
  ],
  providers: [
    LlmAdapterService,
    LlmRouterService,
    DeepseekProvider
    // 移除重复的EncryptionService，使用CoreModule导出的实例
  ],
  exports: [LlmAdapterService],
})
export class LlmModule {}
