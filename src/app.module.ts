import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { McpGatewayModule } from './mcp-gateway/mcp-gateway.module';
import { LlmModule } from './llm/llm.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { TaskQueueModule } from './task-queue/task-queue.module';
import { CoreModule } from './core/core.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CodeAnalysisController } from './core/code-analysis.controller';
import { DataRelationController } from './core/data-relation.controller';
import { configuration } from './config/configuration';
import { NodeAdapterModule } from './node-adapter/node-file.module';
import { HealthModule } from './health/health.module';
import { McpConfigModule } from './config/mcp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CoreModule,
    MongooseModule.forRoot(process.env['MONGODB_URI'] || 'mongodb://localhost/cline'),
    BullModule.forRoot({
      redis: {
        host: process.env['REDIS_HOST'] || 'localhost',
        port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      },
    }),
    McpConfigModule,
    McpGatewayModule,
    LlmModule,
    OrchestrationModule,
    TaskQueueModule,
    NodeAdapterModule,
    HealthModule
  ],
  providers: [
    {
      provide: 'CONFIG_PATH',
      useFactory: (config: ConfigService) => config.get('configPath'),
      inject: [ConfigService]
    },
    AppService,
  ],
  controllers: [AppController, CodeAnalysisController, DataRelationController],
  exports: [
    'CONFIG_PATH'
  ],
})
export class AppModule {}
