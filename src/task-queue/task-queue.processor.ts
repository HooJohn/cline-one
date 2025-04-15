import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Injectable, UnprocessableEntityException, InternalServerErrorException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { McpDiscoveryService } from '../mcp-gateway/discovery/mcp-discovery.service';
import { WorkflowTaskDto } from '../orchestration/dto/workflow-task.dto';
import { ConfigService } from '@nestjs/config';
import { RetryPolicy } from '../core/dto/retry-policy.dto';
import { RedisService } from '../core/redis.service';

// 最大重试次数
const MAX_RETRY_ATTEMPTS = 3;
// 基础重试延迟（毫秒）
const BASE_RETRY_DELAY = 1000;
// 重试延迟因子
const RETRY_BACKOFF_FACTOR = 2;
// 最大重试延迟（毫秒）
const MAX_RETRY_DELAY = 60000;
// 内存警告阈值
const MEMORY_WARNING_THRESHOLD = 90;
// 内存危险阈值
const MEMORY_CRITICAL_THRESHOLD = 95;

// 自定义错误类
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class WorkerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerUnavailableError';
  }
}

@Injectable()
@Processor('taskQueue')
export class TaskQueueProcessor {
  private readonly logger = new Logger(TaskQueueProcessor.name);
  private readonly defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 3,
    delay: 1000,
    backoffFactor: 2,
    maxDelay: 60000,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', '5xx', 'WorkerUnavailableError']
  };
  private memoryCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly mcpDiscovery: McpDiscoveryService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService
  ) {
    this.startMemoryMonitoring();
  }

  private startMemoryMonitoring() {
    this.memoryCheckInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 5000); // 每5秒检查一次
  }

  private checkMemoryUsage() {
    const used = process.memoryUsage();
    const memoryUsagePercent = (used.heapUsed / used.heapTotal) * 100;

    if (memoryUsagePercent > MEMORY_CRITICAL_THRESHOLD) {
      this.logger.warn(`[资源告警] 内存使用率严重过高 (已用: ${memoryUsagePercent.toFixed(1)}%)，强制执行垃圾回收`);
      if (global.gc) {
        global.gc();
      }
    } else if (memoryUsagePercent > MEMORY_WARNING_THRESHOLD) {
      this.logger.warn(`[资源告警] 内存使用率过高 (已用: ${memoryUsagePercent.toFixed(1)}%)，建议优化`);
    }
  }

  @Process('main')
  async handleTask(job: Job<WorkflowTaskDto>) {
    try {
      // 确保任务有ID
      if (!job.data.taskId) {
        job.data.taskId = uuidv4();
        this.logger.debug(`生成新任务ID: ${job.data.taskId}`);
      }

      this.logger.log(`启动任务处理 [队列ID: ${job.id}]`, {
        jobId: job.id.toString(),
        taskId: job.data.taskId,
        type: job.data.type,
        attemptsMade: job.attemptsMade,
        bullId: job.id
      });

      // 检查重试次数
      if (job.attemptsMade >= MAX_RETRY_ATTEMPTS) {
        this.logger.warn(`任务重试次数已达上限 [任务ID: ${job.data.taskId}]，将不再重试`);
        throw new Error('任务重试次数已达上限');
      }

      await this.validateTask(job.data);
      
      // 存储聊天上下文元数据
      if (job.data.chatId) {
        const contextKey = `chat:${job.data.chatId}:context`;
        await this.redisService.set(contextKey, JSON.stringify({
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          taskCount: parseInt(await this.redisService.get(`chat:${job.data.chatId}:task_counter`) || '0') + 1
        }));
      }

      const result = await this.executeTaskWithRetry(job);
      
      // 更新上下文最后活动时间
      if (job.data.chatId) {
        const contextKey = `chat:${job.data.chatId}:context`;
        const context = JSON.parse(await this.redisService.get(contextKey) || '{}');
        context.lastActivity = new Date().toISOString();
        await this.redisService.set(contextKey, JSON.stringify(context));
      }
      
      return result;
    } catch (error) {
      if (error instanceof ValidationError) {
        this.logger.warn(`任务验证失败 [任务ID: ${job.data.taskId}]: ${error.message}`);
        // 对于验证错误，直接失败不重试
        await job.remove();
        throw new UnprocessableEntityException(error.message);
      } else if (error instanceof Error && error.message === '任务重试次数已达上限') {
        // 对于重试次数超限的任务，直接失败不重试
        await job.remove();
        throw new UnprocessableEntityException(error.message);
      } else {
        this.logger.error(`任务执行失败 [任务ID: ${job.data.taskId}]: ${error instanceof Error ? error.message : '未知错误'}`, error instanceof Error ? error.stack : undefined);
        
        // 计算下次重试延迟
        const nextRetryDelay = Math.min(
          BASE_RETRY_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, job.attemptsMade),
          MAX_RETRY_DELAY
        );
        
        // 抛出错误以触发 Bull 的内置重试机制
        throw new InternalServerErrorException(error instanceof Error ? error.message : '未知错误');
      }
    }
  }

  @OnQueueActive()
  async onActive(job: Job<WorkflowTaskDto>) {
    this.logger.log(`任务开始处理 [队列ID: ${job.id}]`, {
      jobId: job.id.toString(),
      taskId: job.data.taskId,
      bullId: job.id,
      timestamp: new Date().toISOString()
    });
    await this.updateTaskStatus(job.id.toString(), 'active');
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<WorkflowTaskDto>, result: any) {
    this.logger.log(`任务处理完成 [队列ID: ${job.id}]`, {
      jobId: job.id.toString(),
      taskId: job.data.taskId,
      bullId: job.id,
      result,
      timestamp: new Date().toISOString()
    });
    await this.updateTaskStatus(job.id.toString(), 'completed', result);
    
    // 任务完成后清理相关资源
    await this.cleanupTaskResources(job);
  }

  @OnQueueFailed()
  async onFailed(job: Job<WorkflowTaskDto>, error: Error) {
    this.logger.error(`任务处理失败 [队列ID: ${job.id}]`, {
      jobId: job.id.toString(),
      taskId: job.data.taskId,
      bullId: job.id,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      attemptsMade: job.attemptsMade
    });
    await this.updateTaskStatus(job.id.toString(), 'failed', null, error);
    
    // 如果任务已达到最大重试次数，清理资源
    if (job.attemptsMade >= MAX_RETRY_ATTEMPTS) {
      await this.cleanupTaskResources(job);
    }
  }

  private async validateTask(task: WorkflowTaskDto): Promise<void> {
    if (!task.taskId) {
      throw new ValidationError('业务任务ID不能为空');
    }
    // 添加默认任务类型
    if (!task.type) {
      task.type = 'default';
      this.logger.warn(`自动设置默认任务类型 [任务ID: ${task.taskId}]`);
    }
    if (!task.payload) {
      throw new ValidationError('任务负载不能为空');
    }
  }

  private async executeTaskWithRetry(job: Job<WorkflowTaskDto>) {
    const retryPolicy = job.data.retryPolicy || {
      maxAttempts: MAX_RETRY_ATTEMPTS,
      delay: BASE_RETRY_DELAY,
      backoffFactor: RETRY_BACKOFF_FACTOR,
      maxDelay: MAX_RETRY_DELAY
    };

    let attempts = job.attemptsMade;
    let delay = retryPolicy.delay;

    while (attempts < retryPolicy.maxAttempts) {
      try {
        const worker = await this.mcpDiscovery.getOptimalWorker(job.data);
        if (!worker) {
          throw new WorkerUnavailableError('无法找到合适的工作节点');
        }

        this.logger.debug(`分配到工作节点 [节点ID: ${worker.id}]`, {
          jobId: job.id.toString(),
          taskId: job.data.taskId,
          workerId: worker.id,
          attempt: attempts + 1
        });

        const result = await this.mcpDiscovery.executeTaskOnWorker(worker.id, job.data);
        
        this.logger.log(`任务执行成功 [任务ID: ${job.data.taskId}]`, {
          jobId: job.id.toString(),
          taskId: job.data.taskId,
          workerId: worker.id,
          result
        });

        return result;
      } catch (error) {
        attempts++;
        
        if (attempts >= retryPolicy.maxAttempts) {
          this.logger.error(`任务重试次数已达上限 [任务ID: ${job.data.taskId}]`, {
            jobId: job.id.toString(),
            taskId: job.data.taskId,
            error: error instanceof Error ? error.message : '未知错误',
            attempts
          });
          throw error;
        }

        this.logger.warn(`任务执行失败，准备重试 [任务ID: ${job.data.taskId}]`, {
          jobId: job.id.toString(),
          taskId: job.data.taskId,
          error: error instanceof Error ? error.message : '未知错误',
          attempt: attempts,
          nextRetryDelay: delay
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * retryPolicy.backoffFactor, retryPolicy.maxDelay);
      }
    }
  }

  private async cleanupTaskResources(job: Job<WorkflowTaskDto>) {
    try {
      // 清理Redis中的任务状态
      const taskKey = `task:${job.id}:status`;
      await this.redisService.set(taskKey, ''); // 回退到使用空字符串
      
      // 如果有聊天上下文，更新计数器
      if (job.data.chatId) {
        const counterKey = `chat:${job.data.chatId}:task_counter`;
        const currentCount = parseInt(await this.redisService.get(counterKey) || '0');
        if (currentCount > 0) {
          await this.redisService.set(counterKey, (currentCount - 1).toString());
        }
      }
      
      // 手动触发垃圾回收
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      this.logger.warn(`清理任务资源失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async updateTaskStatus(
    jobId: string,
    status: 'active' | 'completed' | 'failed',
    result?: any,
    error?: Error
  ) {
    try {
      const taskKey = `task:${jobId}:status`;
      await this.redisService.set(taskKey, JSON.stringify({
        jobId,
        status,
        result,
        error: error?.message,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      this.logger.warn(`Redis操作失败，但继续处理任务: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
