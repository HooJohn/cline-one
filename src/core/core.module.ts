import { Module } from '@nestjs/common';
import { RedisService } from './data-relation.service';
import { SharedConfigModule } from '../config/config.module';
import { LlmModule } from '../llm/llm.module';
import { LlmAdapterService } from '../llm/llm-adapter.service';
import { NodeAdapterModule } from '../node-adapter/node-file.module';

@Module({
  imports: [
    SharedConfigModule,
    LlmModule,
    NodeAdapterModule
  ],
  providers: [
    RedisService,
    LlmAdapterService
  ],
  exports: [RedisService]
})
export class CoreModule {}
