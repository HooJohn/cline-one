import { Injectable } from '@nestjs/common';
import { LlmAdapterService } from '../llm/llm-adapter.service';

@Injectable()
export class OrchestrationService {
  constructor(private readonly llmAdapter: LlmAdapterService) {}

  async handleExecution(prompt: string) {
    try {
      const result = await this.llmAdapter.generateCompletion(prompt);
      return {
        success: true,
        response: result.content,
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
