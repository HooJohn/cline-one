import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { McpDiscoveryService } from '../mcp-gateway/discovery/mcp-discovery.service';
import { WorkflowTaskDto } from '../orchestration/dto/workflow-task.dto';

@Processor('taskQueue')
export class TaskQueueProcessor {
  private readonly logger = new Logger(TaskQueueProcessor.name);

  constructor(private readonly mcpDiscovery: McpDiscoveryService) {}

  @Process('main')
  async handleTask(job: Job<WorkflowTaskDto>) {
    this.logger.log(`启动任务处理 [任务ID: ${job.data.taskId}]`);
    try {
      const worker = await this.mcpDiscovery.getOptimalWorker(job.data);
      this.logger.debug(`分配到工作节点 [节点ID: ${worker.id}]`);
      
      const result = await this.mcpDiscovery.executeTaskOnWorker(worker.id, job.data);
      
      this.logger.log(`任务完成 [任务ID: ${job.data.taskId}]`);
      return result;
    } catch (error) {
      this.logger.error(`任务执行失败 [任务ID: ${job.data.taskId}]: ${error.message}`);
      throw error;
    }
  }
}