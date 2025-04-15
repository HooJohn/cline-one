import { Global, Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrchestrationController } from './orchestration.controller';
import { OrchestrationService } from './orchestration.service';
import { LlmModule } from '../llm/llm.module';
import { ResourceOptimizerService } from './resource-optimizer.service';
import { McpGatewayModule } from '../mcp-gateway/mcp-gateway.module';
import { TaskQueueModule } from '../task-queue/task-queue.module';
import { PolicyManagerService } from './policy-manager.service';
import { ResourceLoaderService } from './resource-loader.service';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { Message, MessageSchema } from './schemas/message.schema';

@Global() // 使此模块全局可用，减少重复导入
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    forwardRef(() => LlmModule),
    forwardRef(() => McpGatewayModule),
    TaskQueueModule,
  ],
  controllers: [OrchestrationController],
  providers: [
    OrchestrationService,
    ResourceOptimizerService,
    PolicyManagerService,
    ResourceLoaderService // Add ResourceLoaderService to providers
  ],
  exports: [
    OrchestrationService,
    ResourceOptimizerService,
    PolicyManagerService,
    ResourceLoaderService // Export ResourceLoaderService
  ]
})
export class OrchestrationModule {}
