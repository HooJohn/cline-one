import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TaskSchedulerService {
  constructor(
    @InjectQueue('taskQueue') private taskQueue: Queue,
    private configService: ConfigService
  ) {}

  async scheduleTask(taskId: string, payload: any, delay?: number): Promise<Job> {
    const options = delay ? { 
      delay,
      attempts: this.configService.get('TASK_MAX_RETRIES') || 3
    } : {
      attempts: this.configService.get('TASK_MAX_RETRIES') || 3
    };
    
    return this.taskQueue.add('process', { id: taskId, ...payload }, options);
  }

  async scheduleDelayedTask(taskId: string, delayMs: number, payload: any): Promise<Job> {
    return this.taskQueue.add('delayedTask', 
      { id: taskId, ...payload }, 
      { 
        delay: delayMs,
        attempts: this.configService.get('TASK_MAX_RETRIES') || 3
      }
    );
  }

  async getJobStatus(taskId: string): Promise<string> {
    const job = await this.taskQueue.getJob(taskId);
    if (!job) {
      return 'not_found';
    }
    return job.getState();
  }

  async executeTask(taskId: string, payload: any) {
    console.log(`Executing task ${taskId} with payload:`, payload);
    return { taskId, status: 'processed' };
  }

  private calculatePriority(task: any): number {
    // 保留原有优先级计算逻辑
    return task.priority || 1;
  }
}
