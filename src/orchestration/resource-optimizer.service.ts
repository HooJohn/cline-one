import { Injectable, Logger } from '@nestjs/common';
import { McpDiscoveryService } from '../mcp-gateway/discovery/mcp-discovery.service';
import { LlmAdapterService } from '../llm/llm-adapter.service';
import { McpServer, ServerStatus } from '../interfaces/mcp-server.interface';
import { WorkflowTaskDto } from './dto/workflow-task.dto';
import * as os from 'os';
import * as osUtils from 'os-utils';
import { ConfigService } from '@nestjs/config';
import { TaskSchedulerService } from '../task-queue/task-scheduler.service';
import { Registry } from 'prom-client';
import { RedisService } from '../core/redis.service';

// Define a more detailed health status or score
interface WorkerHealthInfo {
  serverId: string;
  status: ServerStatus;
  lastHeartbeat: number;
  healthScore: number;
}

interface TaskCostEstimate {
  estimatedTokens?: number;
  estimatedCost?: number;
  currency?: string;
}

interface SystemMetrics {
  cpuUsage: number;
  freeMem: number;
  totalMem: number;
  loadAvg: number;
  timestamp: number;
}

@Injectable()
export class ResourceOptimizerService {
  private readonly COST_FACTOR = 0.85;

  async optimize(resources: any[]): Promise<any> {
    const optimized = await this.llmAdapter.analyze({
      templateType: 'resource-optimization',
      variables: {
        resources: JSON.stringify(resources)
      }
    });

    return {
      ...optimized,
      cost: this.calculateCost(optimized.plan),
      timestamp: new Date().toISOString()
    };
  }

  private calculateCost(plan: any[]): number {
    return plan.reduce((total, item) => 
      total + (item.cpu * 0.02 + item.memory * 0.01 + item.storage * 0.005) * this.COST_FACTOR, 0);
  }

  async cacheOptimizationPlan(plan: any): Promise<void> {
    await this.redisService.set(
      `optimization:${plan.timestamp}`,
      JSON.stringify(plan)
    );
  }
  private readonly registry = new Registry();
  private readonly logger = new Logger(ResourceOptimizerService.name);
  private monitoringInterval: NodeJS.Timeout | null = null;
  private systemMetricsHistory: SystemMetrics[] = [];

  constructor(
    private readonly mcpDiscovery: McpDiscoveryService,
    private readonly llmAdapter: LlmAdapterService,
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
    private readonly taskScheduler: TaskSchedulerService
  ) {
    // 初始化监控指标
    this.registry.setDefaultLabels({
      app: 'orchestration-service',
      version: '1.0'
    });
    
    // 启动系统监控
    this.startMonitoring();
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Assesses the health of a specific MCP worker.
   * @param server The McpServer object.
   * @returns Detailed health information including a calculated score.
   */
  assessWorkerHealth(server: McpServer): WorkerHealthInfo {
    const now = Date.now();
    let healthScore = 0;

    // Basic scoring based on status and heartbeat freshness
    if (server.status === 'healthy' || server.status === 'connected') {
      healthScore = 0.8; // Base score for being responsive
      const timeSinceHeartbeat = now - server.lastHeartbeat;
      // Penalize if heartbeat is stale (e.g., older than 2x the check interval)
      // Assuming heartbeat interval is around 30s (adjust as needed)
      if (timeSinceHeartbeat > 60000) {
        healthScore *= 0.5; // Reduce score significantly if heartbeat is old
      }
    } else if (server.status === 'unknown') {
      healthScore = 0.2; // Low score for unknown status
    } // 'unhealthy' status keeps score at 0

    // TODO: Incorporate latency, error rates, etc., if available from discovery/monitoring

    this.logger.debug(`Assessed health for worker ${server.id}: Status=${server.status}, Score=${healthScore.toFixed(2)}`);
    return {
      serverId: server.id,
      status: server.status,
      lastHeartbeat: server.lastHeartbeat,
      healthScore: parseFloat(healthScore.toFixed(2)), // Keep precision reasonable
    };
  }

  /**
   * Predicts the resource cost (e.g., LLM tokens, compute time) for a given task.
   * Placeholder implementation.
   * @param task The workflow task.
   * @returns An estimated cost.
   */
  async predictTaskCost(task: WorkflowTaskDto): Promise<TaskCostEstimate> {
    this.logger.debug(`Predicting cost for task ${task.taskId}...`);
    // Placeholder: This would involve analyzing the task, potentially querying
    // the LlmAdapterService based on the modelType and expected workload.
    // For now, return a dummy estimate.
    let estimatedTokens = 0;
    if (task.modelType) { // Check if it's an LLM task
        // Example: Rough estimate based on priority or resource estimate?
        estimatedTokens = (task.resourceEstimate['promptLength'] || 1000) * (task.priority || 1); 
    }

    // TODO: Implement actual cost prediction logic, potentially calling llmAdapter.estimateCost(task)
    const estimate: TaskCostEstimate = {
        estimatedTokens: estimatedTokens > 0 ? estimatedTokens : undefined,
        // estimatedCost: calculate cost based on tokens and model pricing
    };
    this.logger.debug(`Predicted cost for task ${task.taskId}: ${JSON.stringify(estimate)}`);
    return estimate;
  }

  /**
   * Finds the optimal worker for a given task based on requirements, health, cost, and capabilities.
   * @param task The task requiring resource allocation.
   * @returns The ID of the optimal McpServer or null if none suitable is found.
   */
  async findOptimalWorker(task: WorkflowTaskDto): Promise<string | null> {
    this.logger.log(`Finding optimal worker for task ${task.taskId} (Priority: ${task.priority})`);
    const availableWorkers = this.mcpDiscovery.getAvailableWorkers(); // Gets healthy workers with 'task-processing' capability

    if (availableWorkers.length === 0) {
      this.logger.warn(`No available workers found for task ${task.taskId}.`);
      return null;
    }

    const workerEvaluations = await Promise.all(
      availableWorkers.map(async (worker) => {
        const healthInfo = this.assessWorkerHealth(worker);
        const costEstimate = await this.predictTaskCost(task); // Consider task cost per worker if pricing varies

        // TODO: Check specific capabilities required by the task against worker.capabilities
        // Example: if (task.requiredCapability && !worker.capabilities.includes(task.requiredCapability)) return null;

        // TODO: Factor in current worker load (requires TaskSchedulerService or DiscoveryService to expose load info)
        // const currentLoad = this.getWorkerLoad(worker.id); 

        // Simple scoring: prioritize health, then consider cost (lower is better)
        // This scoring logic needs refinement based on actual priorities (cost vs. speed vs. reliability)
        let score = healthInfo.healthScore * 100; // Weight health heavily
        if (costEstimate.estimatedTokens) {
            // Penalize higher cost - invert and scale (adjust scaling factor as needed)
            score -= (costEstimate.estimatedTokens / 1000); 
        }
        // if (currentLoad) { score -= currentLoad * 10; } // Penalize high load

        return { workerId: worker.id, score, healthInfo, costEstimate };
      })
    );

    // Filter out any workers that didn't meet criteria (e.g., missing capabilities)
    const validWorkers = workerEvaluations.filter(evaluation => evaluation !== null && evaluation.score > 0);

    if (validWorkers.length === 0) {
      this.logger.warn(`No suitable workers found after evaluation for task ${task.taskId}.`);
      return null;
    }

    // Sort by score descending (higher score is better)
    validWorkers.sort((a, b) => b.score - a.score);

    const optimalWorker = validWorkers[0];
    this.logger.log(`Optimal worker selected for task ${task.taskId}: ${optimalWorker.workerId} (Score: ${optimalWorker.score.toFixed(2)})`);
    
    return optimalWorker.workerId;
  }

  /**
   * Provides aggregated status information about system resources (MCP workers).
   * Useful for monitoring dashboards.
   */
  async getSystemResourceStatus(): Promise<any> {
    // Call the new public method to get all servers
    const allServers = this.mcpDiscovery.getAllRegisteredServers(); 
    const healthAssessments = await Promise.all(
        allServers.map(server => this.assessWorkerHealth(server))
    );

    const healthyWorkers = healthAssessments.filter(h => h.healthScore > 0.5); // Example threshold
    const unhealthyWorkers = healthAssessments.filter(h => h.healthScore <= 0.5);

    // TODO: Add average load, cost metrics when available

    return {
      totalWorkers: allServers.length,
      healthyWorkerCount: healthyWorkers.length,
      unhealthyWorkerCount: unhealthyWorkers.length,
      workers: healthAssessments, // Provide detailed health info
      // averageLoad: ...
      // totalEstimatedCostPerHour: ...
    };
  }

  // 系统资源监控核心逻辑
  private startMonitoring() {
    const interval = this.config.get('RESOURCE_MONITOR_INTERVAL') || 5000;
    
    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        this.systemMetricsHistory.push(metrics);
        this.adjustResourcesBasedOnMetrics(metrics);
      } catch (error: unknown) {
        this.logger.error(`资源监控出错: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, interval);
  }

  private async collectMetrics(): Promise<SystemMetrics> {
    return new Promise((resolve) => {
      osUtils.cpuUsage((cpuUsage) => {
        resolve({
          cpuUsage: cpuUsage * 100,
          freeMem: os.freemem() / 1024 / 1024, // 转换为MB
          totalMem: os.totalmem() / 1024 / 1024,
          loadAvg: osUtils.loadavg(5),
          timestamp: Date.now()
        });
      });
    });
  }

  private adjustResourcesBasedOnMetrics(metrics: SystemMetrics) {
    const { cpuUsage, freeMem, totalMem } = metrics;
    // 使用process.memoryUsage()获取更精确的Node进程内存使用
    const processMem = process.memoryUsage();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = (usedMem / totalMem) * 100;
    const dynamicMemThreshold = this.config.get('MEM_THRESHOLD') || 
      Math.min(0.3, 0.15 + (0.15 * (cpuUsage / 100)));

    // 优化日志格式并添加进程内存信息
    this.logger.debug(`[内存监控] 系统内存: 总=${totalMem.toFixed(1)}MB 已用=${usedMem.toFixed(1)}MB (${memUsagePercent.toFixed(1)}%)
      进程内存: RSS=${(processMem.rss/1024/1024).toFixed(1)}MB 
      HeapTotal=${(processMem.heapTotal/1024/1024).toFixed(1)}MB
      HeapUsed=${(processMem.heapUsed/1024/1024).toFixed(1)}MB`);

    // 内存优化策略（添加二次验证）
    if (usedMem > dynamicMemThreshold * totalMem && memUsagePercent > 85) {
      this.logger.warn(`[资源告警] 内存使用率过高 (已用: ${memUsagePercent.toFixed(1)}%)，触发优化措施`);
      this.taskScheduler.scheduleTask('memory_optimize', { 
        action: 'cleanup',
        severity: memUsagePercent > 90 ? 'critical' : 'warning'
      }, 0);
    }

    // CPU优化策略（添加频率限制）
    if (cpuUsage > 80) {
      const lastCpuSpike = this.systemMetricsHistory
        .slice(-5)
        .find(m => m.cpuUsage > 80);
        
      if (!lastCpuSpike || (Date.now() - lastCpuSpike.timestamp) > 30000) {
        this.logger.warn(`[资源告警] CPU使用率过高 (${cpuUsage.toFixed(1)}%)，触发负载均衡`);
        this.taskScheduler.scheduleTask('load_balance', { 
          threshold: cpuUsage,
          strategy: 'round-robin'
        }, 0);
      }
    }
  }
   // private getWorkerLoad(workerId: string): number {
   //    // This needs access to the TaskSchedulerService's workerLoad map or similar data
   //    // This creates a dependency cycle or requires shared state/service.
   //    // Option 1: Inject TaskSchedulerService (creates cycle if scheduler uses optimizer)
   //    // Option 2: DiscoveryService tracks/provides load
   //    // Option 3: Use a shared state service (e.g., Redis)
   //    this.logger.warn(`getWorkerLoad not implemented - Worker load balancing unavailable.`);
   //    return 0; 
   // }
}
