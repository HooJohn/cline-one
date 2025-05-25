import { Injectable, Logger } from '@nestjs/common';
import { McpDiscoveryService } from '../mcp-gateway/discovery/mcp-discovery.service';
import { LlmAdapterService } from '../llm/llm-adapter.service';
import { ExecutionPlanDto } from './dto/execution-plan.dto';
import { WorkflowTaskDto } from './dto/workflow-task.dto'; 
import { RetryPolicy } from '../core/dto/retry-policy.dto';
import { McpServer } from '../mcp-gateway/interfaces/mcp-server.interface';

@Injectable()
export class TaskSchedulerService {
  private readonly logger = new Logger(TaskSchedulerService.name);
  private taskQueue: WorkflowTaskDto[] = [];
  private activeTasks = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly mcpDiscovery: McpDiscoveryService,
    private readonly llmAdapter: LlmAdapterService
  ) {}

  async scheduleTasks(plan: ExecutionPlanDto) {
    await this.validateResources(plan);
    const optimizedPlan = await this.optimizeTaskRouting(plan);
    return this.distributeTasks(optimizedPlan);
  }

  private async validateResources(plan: ExecutionPlanDto) {
    this.logger.log('Validating system resources...');
    const workers = await this.mcpDiscovery.getAvailableWorkers();
    if (workers.length === 0) {
      throw new Error('No available worker nodes');
    }
  }

  private async optimizeTaskRouting(plan: ExecutionPlanDto): Promise<ExecutionPlanDto> {
    const optimized = await this.llmAdapter.optimizePlan(plan);
    return this.applySchedulingPolicies(optimized);
  }

  private applySchedulingPolicies(plan: ExecutionPlanDto): ExecutionPlanDto {
    // 实现智能调度策略
    return {
      ...plan,
      tasks: plan.tasks.sort((a, b) => b.priority - a.priority)
    };
  }

  private async distributeTasks(plan: ExecutionPlanDto) {
    const workers = await this.mcpDiscovery.getAvailableWorkers();
    const batchSize = Math.ceil(plan.tasks.length / workers.length);
    
    const assignments = workers.map((worker, index) => {
      const start = index * batchSize;
      const end = start + batchSize;
      return {
        workerId: worker.id,
        tasks: plan.tasks.slice(start, end),
        retryPolicy: plan.globalRetryPolicy
      };
    });

    const results = await Promise.allSettled(
      assignments.map(assignment => 
        this.executeTaskBatch(assignment.workerId, assignment.tasks, assignment.retryPolicy)
      )
    );

    return this.processResults(results);
  }

  private async executeTaskBatch(workerId: string, tasks: WorkflowTaskDto[], retryPolicy: RetryPolicy) {
    try {
      const worker = this.mcpDiscovery.getWorker(workerId);
      if (!worker) throw new Error(`Worker ${workerId} not found`);
      
      const results = [];
      for (const task of tasks) {
        const result = await this.executeWithRetry(() => 
          worker.protocolAdapter.executeTask(task),
          retryPolicy
        );
        results.push(result);
      }
      return results;
    } catch (error) {
      this.logger.error(`Task batch failed on worker ${workerId}: ${error.message}`);
      throw error;
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>, policy: RetryPolicy): Promise<T> {
    let attempts = 0;
    let delay = policy.delay;

    while (attempts < policy.maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        attempts++;
        if (attempts >= policy.maxAttempts) throw error;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= policy.backoffFactor;
      }
    }
    throw new Error('Max retry attempts exceeded');
  }

  private processResults(results: PromiseSettledResult<any>[]) {
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - successful;
    
    return {
      totalTasks: results.length,
      successful,
      failed,
      details: results.map(r => 
        r.status === 'fulfilled' ? r.value : r.reason
      )
    };
  }
}
