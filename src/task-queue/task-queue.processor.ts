import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Injectable, UnprocessableEntityException, InternalServerErrorException } from '@nestjs/common';
import { McpDiscoveryService } from '../mcp-gateway/discovery/mcp-discovery.service';
import { WorkflowTaskDto } from '../orchestration/dto/workflow-task.dto';
import { ConfigService } from '@nestjs/config';
import { RetryPolicy } from '../core/dto/retry-policy.dto';

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

  constructor(
    private readonly mcpDiscovery: McpDiscoveryService,
    private readonly configService: ConfigService
  ) {}

  @Process('main')
  async handleTask(job: Job<WorkflowTaskDto>) {
    const { createClient } = require('redis');
    const redisClient = createClient({
      url: process.env.REDIS_URL,
      database: job.data.chatId ? 1 : 0
    });
    await redisClient.connect();

    try {
      this.logger.log(`启动任务处理 [任务ID: ${job.data.taskId}]`, {
        jobId: job.id.toString(),
        taskId: job.data.taskId,
        type: job.data.type
      });

      // 存储聊天上下文元数据
      if (job.data.chatId) {
        await redisClient.hSet(`chat:${job.data.chatId}:context`, {
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          taskCount: await redisClient.incr(`chat:${job.data.chatId}:task_counter`)
        });
      }

      await this.validateTask(job.data);
      const result = await this.executeTaskWithRetry(job);
      
      // 更新上下文最后活动时间
      if (job.data.chatId) {
        await redisClient.hSet(`chat:${job.data.chatId}:context`, 'lastActivity', new Date().toISOString());
      }
      
      return result;
    } catch (error) {
      if (error instanceof ValidationError) {
        this.logger.warn(`任务验证失败 [任务ID: ${job.data.taskId}]: ${error.message}`);
        throw new UnprocessableEntityException(error.message);
      } else if (error instanceof WorkerUnavailableError) {
        this.logger.error(`无可用工作节点 [任务ID: ${job.data.taskId}]: ${error.message}`);
        await this.handleWorkerUnavailable(job);
        throw error;
      } else {
        this.logger.error(`任务执行失败 [任务ID: ${job.data.taskId}]: ${error.message}`, error.stack);
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  @OnQueueActive()
  async onActive(job: Job<WorkflowTaskDto>) {
    this.logger.log(`任务开始处理 [任务ID: ${job.data.taskId}]`, {
      jobId: job.id.toString(),
      taskId: job.data.taskId,
      timestamp: new Date().toISOString()
    });
    await this.updateTaskStatus(job.id.toString(), 'active');
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<WorkflowTaskDto>, result: any) {
    this.logger.log(`任务处理完成 [任务ID: ${job.data.taskId}]`, {
      jobId: job.id.toString(),
      taskId: job.data.taskId,
      result,
      timestamp: new Date().toISOString()
    });
    await this.updateTaskStatus(job.id.toString(), 'completed', result);
  }

  @OnQueueFailed()
  async onFailed(job: Job<WorkflowTaskDto>, error: Error) {
    this.logger.error(`任务处理失败：任务ID: ${job.data.taskId}`, {
      jobId: job.id.toString(),
      taskId: job.data.taskId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    await this.updateTaskStatus(job.id.toString(), 'failed', null, error);
  }

  private async validateTask(task: WorkflowTaskDto): Promise<void> {
    if (!task.taskId) {
      throw new ValidationError('任务ID不能为空');
    }
    if (!task.type) {
      throw new ValidationError('任务类型不能为空');
    }
    if (!task.payload) {
      throw new ValidationError('任务负载不能为空');
    }
  }

  private async executeTaskWithRetry(job: Job<WorkflowTaskDto>) {
    const retryPolicy = {
      ...this.defaultRetryPolicy,
      ...job.data.retryPolicy
    };

    let attempts = 0;
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
            error: error.message,
            attempts
          });
          throw error;
        }

        this.logger.warn(`任务执行失败，准备重试 [任务ID: ${job.data.taskId}]`, {
          jobId: job.id.toString(),
          taskId: job.data.taskId,
          error: error.message,
          attempt: attempts,
          nextRetryDelay: delay
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * retryPolicy.backoffFactor, retryPolicy.maxDelay);
      }
    }
  }

  private async handleWorkerUnavailable(job: Job<WorkflowTaskDto>) {
    // 实现工作节点不可用的处理逻辑
    // 例如：通知管理员、标记节点状态等
    this.logger.warn(`工作节点不可用，任务将重试 [任务ID: ${job.data.taskId}]`, {
      jobId: job.id.toString(),
      taskId: job.data.taskId,
      timestamp: new Date().toISOString()
    });
  }

  private async updateTaskStatus(
    jobId: string,
    status: 'active' | 'completed' | 'failed',
    result?: any,
    error?: Error
  ) {
    try {
      // 这里可以实现任务状态更新的具体逻辑
      // 例如：更新数据库、发送通知等
      this.logger.debug(`更新任务状态 [任务ID: ${jobId}]: ${status}`, {
        jobId,
        status,
        result,
        error: error?.message,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error(`更新任务状态失败 [任务ID: ${jobId}]: ${error.message}`, error.stack);
    }
  }
}
