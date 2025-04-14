import { Injectable, Inject } from '@nestjs/common';
import { ApiException } from '@common/exceptions/api.exception';
import { McpDiscoveryService } from '../mcp-gateway/discovery/mcp-discovery.service';
import { WorkflowTaskDto } from './dto/workflow-task.dto';
import { LlmAdapterService } from '../llm/llm-adapter.service';

export interface ChatSession {
  id: string;
  userId: string;
  context: Record<string, any>;
  messages: Array<{
    content: string;
    files: string[];
    timestamp: Date;
  }>;
}

@Injectable()
export class OrchestrationService {
  private readonly chatSessions = new Map<string, ChatSession>();

  createChatSession(userId: string, context: object = {}): string {
    const chatId = `chat_${Date.now()}`;
    this.chatSessions.set(chatId, {
      id: chatId,
      userId,
      context,
      messages: []
    });
    return chatId;
  }

  addChatMessage(chatId: string, message: string, files: string[] = []): ChatSession {
    const session = this.chatSessions.get(chatId);
    if (!session) {
      throw new ApiException('CHAT_NOT_FOUND', 'Chat session not found', 404);
    }
    
    session.messages.push({
      content: message,
      files,
      timestamp: new Date()
    });
    
    return session;
  }
  constructor(
    @Inject(McpDiscoveryService)
    private readonly discoveryService: McpDiscoveryService,
    private readonly llmAdapter: LlmAdapterService
  ) {}

  async executeWorkflow(workflow: WorkflowTaskDto) {
    // 实现工作流执行逻辑
  }

  async scheduleTask(task: WorkflowTaskDto) {
    const worker = await this.discoveryService.getOptimalWorker(task);
    return this.discoveryService.executeTaskOnWorker(worker.id, task);
  }

  async handleExecution(prompt: string) {
    try {
      const result = await this.llmAdapter.generateCompletion(prompt);
      return {
        success: true,
        response: result,
        metadata: {
          model: this.llmAdapter.getCurrentModelInfo(),
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}
