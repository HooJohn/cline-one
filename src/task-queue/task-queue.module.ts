// src/task-queue/task-queue.module.ts
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { McpGatewayModule } from '../mcp-gateway/mcp-gateway.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TaskQueueProcessor } from './task-queue.processor';
import { TaskSchedulerService } from './task-scheduler.service';
import { ResourceOptimizerService } from '../orchestration/resource-optimizer.service';
import { RedisService } from '../core/data-relation.service';
import { LlmModule } from '../llm/llm.module'; // 添加LLM模块导入

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
          db: config.get('REDIS_DB', 0)
        }
      }),
      inject: [ConfigService]
    }),
    BullModule.registerQueue({
      name: 'taskQueue',
      settings: {
        lockDuration: 30000,
        stalledInterval: 5000
      }
    }),
    McpGatewayModule,
    ConfigModule,
    LlmModule
  ],
  providers: [
    TaskQueueProcessor,
    TaskSchedulerService,
    RedisService
  ],
  exports: [
    BullModule,
    TaskSchedulerService,
    RedisService
  ]
})
export class TaskQueueModule {}
