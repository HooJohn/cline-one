import { Injectable, Inject } from '@nestjs/common';
import { ExecutionPlanDto } from '../orchestration/dto/execution-plan.dto';
import { LlmProvider } from '../interfaces/llm-provider.interface';

@Injectable()
export class LlmAdapterService {
  async analyze(params: { 
    system: string;
    prompt: string 
  }): Promise<{ 
    plan: Array<{
      resourceId: string;
      action: string;
      cpu: number;
      memory: number;
      storage: number;
    }>;
    recommendations: string[];
  }> {
    // 实际应调用LLM接口，此处为示例实现
    return {
      plan: [{
        resourceId: 'res-001',
        action: 'scale-up',
        cpu: 2,
        memory: 4,
        storage: 50
      }],
      recommendations: ['建议增加缓存层', '优化数据库索引']
    };
  }
  constructor(
    @Inject('LLM_PROVIDER') 
    private readonly provider: LlmProvider
  ) {}

  async optimizePlan(plan: ExecutionPlanDto): Promise<ExecutionPlanDto> {
    const optimized = await this.provider.optimizePlan(plan);
    return {
      ...optimized,
      tasks: optimized.tasks.sort((a, b) => b.priority - a.priority)
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
