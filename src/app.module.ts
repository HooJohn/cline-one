import { Module } from '@nestjs/common';
import { SharedConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import { CoreModule } from './core/core.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { LlmModule } from './llm/llm.module'; // 添加LLM模块导入
import { CodeAnalysisController } from './core/code-analysis.controller';
import { DataRelationController } from './core/data-relation.controller';
import { NodeFileService } from './node-adapter/node-file.service';
import { FileService } from './interfaces/file-service.interface';
import { TaskQueueModule } from './task-queue/task-queue.module';
import configuration from './config/configuration';
import { NodeAdapterModule } from './node-adapter/node-file.module';
@Module({
  imports: [
    SharedConfigModule,
    CoreModule,
    LlmModule,
    OrchestrationModule,
    TaskQueueModule,
    NodeAdapterModule
  ],
  providers: [
    {
      provide: 'CONFIG_PATH',
      useFactory: (config: ConfigService) => config.get('configPath'),
      inject: [ConfigService]
    },
    {
      provide: FileService,
      useClass: NodeFileService
    }
  ],
  controllers: [AppController, CodeAnalysisController, DataRelationController],
  exports: [
    'CONFIG_PATH',
    CoreModule,
    LlmModule,
    FileService
  ],
})
export class AppModule {}
