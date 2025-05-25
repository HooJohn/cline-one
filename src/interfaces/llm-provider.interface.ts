import { ExecutionPlanDto } from '../orchestration/dto/execution-plan.dto';

export interface LlmProvider {
  optimizePlan(plan: ExecutionPlanDto): Promise<ExecutionPlanDto>;
  generateResponse(prompt: string): Promise<string>;
  calculateCost(usage: { inputTokens: number; outputTokens: number }): number;
  getModelInfo(): { name: string; version: string };
}
