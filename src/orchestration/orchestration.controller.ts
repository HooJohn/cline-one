import { Controller, Post, Body, Param } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { OrchestrationService } from './orchestration.service';
import { WorkflowTaskDto } from './dto/workflow-task.dto';
import { v4 as uuidv4 } from 'uuid';
import { Types } from 'mongoose';
import { RetryPolicy } from '../core/dto/retry-policy.dto';
import { ModelIntegrationType } from '../core/enums/model-integration-type.enum';

@Controller('orchestration')
export class OrchestrationController {
  constructor(private readonly orchestrationService: OrchestrationService) {}

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

    // 创建任务
    const task: WorkflowTaskDto = {
      taskId: uuidv4(),
      chatId: chatId,
      type: 'llm_completion',
      priority: 1,
      payload: {
        prompt: body.message,
        chatId: chatId,
        messageId: (userMessage._id as Types.ObjectId).toString()
      },
      dataSources: [],
      modelType: ModelIntegrationType.DEEPSEEK,
      resourceEstimate: {
        tokens: body.message.length * 2,
        timeMs: 5000
      },
      timeout: 30000,
      retryPolicy: {
        maxAttempts: 3,
        delay: 1000,
        backoffFactor: 2,
        maxDelay: 60000,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', '5xx', 'WorkerUnavailableError']
      } as RetryPolicy
    };

    // 执行任务
    const aiResponse = await this.orchestrationService.scheduleTask(task);
    
    if (!aiResponse || !aiResponse.response) {
      throw new Error('Failed to get AI response');
    }

    // 保存AI响应
    const assistantMessage = await this.orchestrationService.addChatMessage(
      chatId,
      'assistant',
      aiResponse.response,
      [],
      { 
        executionMetadata: {
          taskId: task.taskId,
          ...aiResponse.metadata
        }
      }
    );

    return {
      userMessage,
      assistantMessage
    };
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
