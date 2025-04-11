import { Module } from '@nestjs/common';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';
import { LlmModule } from '../llm/llm.module';
import { ResourceOptimizerService } from './resource-optimizer.service';
import { McpGatewayModule } from '../mcp-gateway/mcp-gateway.module';
import { TaskQueueModule } from '../task-queue/task-queue.module';

@Module({
  imports: [
    LlmModule,
    McpGatewayModule,
    TaskQueueModule
  ],
  controllers: [OrchestrationController],
  providers: [
    OrchestrationService,
    ResourceOptimizerService
  ],
  exports: [
    OrchestrationService,
    ResourceOptimizerService
  ]
})
export class OrchestrationModule {}
