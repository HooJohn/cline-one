import { Injectable, Inject } from '@nestjs/common';
import { ExecutionPlanDto } from '../orchestration/dto/execution-plan.dto';
import { LlmProvider } from '../interfaces/llm-provider.interface';

@Injectable()
export class LlmAdapterService {
  constructor(
    @Inject('LLM_PROVIDER') 
    private readonly provider: LlmProvider
  ) {}

  async optimizePlan(plan: ExecutionPlanDto): Promise<ExecutionPlanDto> {
    const optimized = await this.provider.optimizePlan(plan);
    return {
      ...optimized,
      tasks: optimized.tasks.sort((a, b) => b.priority - a.priority),
      optimizationLog: optimized.optimizationLog || []
    };
  }

  async generateCompletion(prompt: string) {
    return this.provider.generateResponse(prompt);
  }

  calculateCost(usage: { inputTokens: number; outputTokens: number }) {
    return this.provider.calculateCost(usage);
  }

  getCurrentModelInfo() {
    return this.provider.getModelInfo();
  }
}
