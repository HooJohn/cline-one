import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TaskSchedulerService {
  constructor(
    @InjectQueue('taskQueue') private taskQueue: Queue,
    private configService: ConfigService
  ) {}

  async scheduleTask(taskId: string, payload: any, delay?: number) {
    const options = delay ? { 
      delay,
      attempts: this.configService.get('TASK_MAX_RETRIES') || 3
    } : {
      attempts: this.configService.get('TASK_MAX_RETRIES') || 3
    };
    
    await this.taskQueue.add('executeTask', { taskId, payload }, options);
  }

  async scheduleDelayedTask(taskId: string, delayMs: number, payload: any) {
    await this.taskQueue.add('delayedTask', 
      { taskId, delay: delayMs, payload }, 
      { 
        delay: delayMs,
        attempts: this.configService.get('TASK_MAX_RETRIES') || 3
      }
    );
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
