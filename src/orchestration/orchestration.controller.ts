import { Controller, Post, Body, Param } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { OrchestrationService } from './orchestration.service';
import { WorkflowTaskDto } from './dto/workflow-task.dto';
import { v4 as uuidv4 } from 'uuid';
import { Types } from 'mongoose';
import { RetryPolicy } from '../core/dto/retry-policy.dto';
import { ModelIntegrationType } from '../core/enums/model-integration-type.enum';
import { LlmAdapterService } from '../llm/llm-adapter.service';

@Controller('orchestration')
export class OrchestrationController {
  constructor(
    private readonly orchestrationService: OrchestrationService,
    private readonly llmAdapter: LlmAdapterService
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'Create new chat session' })
  async createChatSession(@Body() body: { userId: string, context?: object }) {
    return this.orchestrationService.createChatSession(body.userId, body.context);
  }

  @Post('chat/:chatId/message')
  @ApiOperation({ summary: 'Add message to chat session and get AI response' })
  async addChatMessage(
    @Param('chatId') chatId: string,
    @Body() body: { message: string, files?: string[] }
  ) {
    // 保存用户消息
    const userMessage = await this.orchestrationService.addChatMessage(
      chatId, 
      'user', 
      body.message, 
      body.files
    );

    try {
      // 直接调用 LLM 适配器
      const aiResponse = await this.llmAdapter.generateCompletion(body.message);

      // 保存AI响应
      const assistantMessage = await this.orchestrationService.addChatMessage(
        chatId,
        'assistant',
        aiResponse,
        [],
        { 
          executionMetadata: {
            taskId: uuidv4(),
            model: 'deepseek-chat'
          }
        }
      );

      return {
        userMessage,
        assistantMessage
      };
    } catch (error) {
      console.error('LLM 调用失败:', error);
      throw error;
    }
  }

  @Post('workflows/:policyId')
  @ApiOperation({ summary: 'Execute an orchestration workflow by policy ID' })
  async executeWorkflow(
    @Param('policyId') policyId: string,
    @Body() body: { context?: Record<string, any> }
  ) {
    return this.orchestrationService.executeWorkflow(policyId, body.context);
  }
}
