import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { LlmModule } from './llm/llm.module'; // 添加LLM模块导入
import { CodeAnalysisController } from './core/code-analysis.controller';
import { DataRelationController } from './core/data-relation.controller';
import { NodeFileService } from './node-adapter/file-system/node-file.service';
import { FileService } from './interfaces/file-service.interface';
import { RedisService } from './core/data-relation.service';
import { TaskQueueModule } from './task-queue/task-queue.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration]
    }),
    LlmModule, // 添加LlmModule
    OrchestrationModule,
    TaskQueueModule,
  ],
  controllers: [AppController, CodeAnalysisController, DataRelationController],
  providers: [
    AppService,
    NodeFileService,
    {
      provide: FileService, 
      useExisting: NodeFileService
    },
    RedisService
  ],
})
export class AppModule {}
