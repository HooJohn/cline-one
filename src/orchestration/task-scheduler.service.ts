import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { McpDiscoveryService } from '../mcp-gateway/discovery/mcp-discovery.service';
import { LlmAdapterService } from '../llm/llm-adapter.service';
import { ExecutionPlanDto } from './dto/execution-plan.dto';
import { WorkflowTaskDto } from './dto/workflow-task.dto';
import { RetryPolicy } from '../core/dto/retry-policy.dto';
import { McpServer } from '../mcp-gateway/interfaces/mcp-server.interface';
import { ConfigService } from '@nestjs/config';

interface ActiveTaskInfo {
  timeoutHandle: NodeJS.Timeout;
  workerId: string;
  startTime: number;
}

@Injectable()
export class TaskSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TaskSchedulerService.name);
  // Simple in-memory priority queue (higher priority value means higher priority)
  private taskQueue: WorkflowTaskDto[] = [];
  // Tracks active tasks: taskId -> ActiveTaskInfo
  private activeTasks = new Map<string, ActiveTaskInfo>();
  // Tracks load per worker: workerId -> numberOfActiveTasks
  private workerLoad = new Map<string, number>();
  private isProcessing = false;
  private maxConcurrentTasksPerWorker: number;

  constructor(
    private readonly mcpDiscovery: McpDiscoveryService,
    private readonly llmAdapter: LlmAdapterService,
    private readonly configService: ConfigService,
  ) {
    // Example: Get max concurrent tasks per worker from config, default to 1
    this.maxConcurrentTasksPerWorker = this.configService.get<number>('orchestration.maxConcurrentTasksPerWorker', 1);
  }

  // Start processing queue on module initialization
  onModuleInit() {
    this.logger.log('TaskSchedulerService initialized. Starting queue processing loop.');
    // Start a simple interval-based queue check
    // In a production scenario, a more robust mechanism (e.g., event-driven) would be better
    setInterval(() => this.triggerProcessing(), 5000); // Check every 5 seconds
  }

  /**
   * Adds tasks from an execution plan to the scheduling queue.
   * @param plan The execution plan containing tasks.
   */
  async scheduleTasks(plan: ExecutionPlanDto): Promise<{ queuedTasks: number }> {
    this.logger.log(`Received plan ${plan.version} with ${plan.tasks.length} tasks.`);

    // Optional: Validate resources broadly before queuing
    // await this.validateResources(); // Basic check if any workers exist

    // Optional: Optimize plan before queuing (could also be a step within task execution)
    // const optimizedPlan = await this.optimizeTaskRouting(plan);

    // Add tasks to the queue
    plan.tasks.forEach(task => this.taskQueue.push(task));

    // Sort the queue by priority (higher number = higher priority)
    this.taskQueue.sort((a, b) => b.priority - a.priority);

    this.logger.log(`Added ${plan.tasks.length} tasks to the queue. Total queue size: ${this.taskQueue.length}`);

    // Trigger processing immediately after adding tasks
    this.triggerProcessing();

    return { queuedTasks: plan.tasks.length };
  }

  private triggerProcessing() {
    if (!this.isProcessing) {
      this.processQueue();
    } else {
      this.logger.debug('Processing already in progress.');
    }
  }

  /**
   * Processes the task queue, assigning tasks to available workers.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.logger.debug(`Processing queue. Current size: ${this.taskQueue.length}`);

    try {
      while (this.taskQueue.length > 0) {
        const worker = await this.findAvailableWorker();
        if (!worker) {
          this.logger.debug('No available workers found or all workers are busy. Pausing processing.');
          break; // Exit the loop if no workers are available/suitable
        }

        // Dequeue the highest priority task
        const task = this.taskQueue.shift();
        if (!task) break; // Should not happen if length > 0, but safety check

        this.logger.log(`Assigning task ${task.taskId} (Priority: ${task.priority}) to worker ${worker.id}`);
        this.incrementWorkerLoad(worker.id);

        // Execute the task asynchronously (don't wait for it to finish here)
        this.executeTask(task, worker).catch(err => {
          // Catch errors here to prevent unhandled promise rejections
          this.logger.error(`Unhandled error during executeTask for ${task.taskId}: ${err.message}`, err.stack);
          // Ensure worker load is decremented even if executeTask fails unexpectedly
          this.decrementWorkerLoad(worker.id);
          // Optionally re-queue the task or mark as failed permanently
          // this.handleTaskFailure(task, worker, err);
        });
      }
    } catch (error) {
      this.logger.error(`Error during queue processing loop: ${error.message}`, error.stack);
    } finally {
      this.isProcessing = false;
      this.logger.debug('Finished processing cycle.');
      // If there are still tasks, trigger again in case workers became free
      if (this.taskQueue.length > 0) {
         // Use setTimeout to avoid immediate recursion if no workers are ever available
         setTimeout(() => this.triggerProcessing(), 1000);
      }
    }
  }

  /**
   * Finds an available and suitable worker based on current load.
   * @returns An available McpServer or null if none found.
   */
  private async findAvailableWorker(): Promise<McpServer | null> {
    const workers = await this.mcpDiscovery.getAvailableWorkers();
    if (workers.length === 0) {
      this.logger.warn('No workers available from discovery service.');
      return null;
    }

    // Find the first worker that is below its concurrent task limit
    // TODO: Implement more sophisticated load balancing (e.g., least loaded, health checks)
    for (const worker of workers) {
      const currentLoad = this.workerLoad.get(worker.id) || 0;
      if (currentLoad < this.maxConcurrentTasksPerWorker) {
        this.logger.debug(`Found available worker ${worker.id} with load ${currentLoad}/${this.maxConcurrentTasksPerWorker}`);
        return worker;
      }
    }

    this.logger.debug('All available workers are currently at maximum capacity.');
    return null;
  }

  /**
   * Executes a single task on a specific worker with retry and timeout logic.
   * @param task The task to execute.
   * @param worker The worker to execute the task on.
   */
  private async executeTask(task: WorkflowTaskDto, worker: McpServer): Promise<void> {
    const taskId = task.taskId;
    const workerId = worker.id;
    const retryPolicy = task.retryPolicy || new RetryPolicy(); // Use default if none provided
    const taskTimeout = task.timeout || 30000; // Default timeout

    this.logger.log(`Executing task ${taskId} on worker ${workerId}. Timeout: ${taskTimeout}ms`);

    const timeoutHandle = setTimeout(() => {
      this.handleTimeout(taskId, workerId);
    }, taskTimeout);

    this.activeTasks.set(taskId, { timeoutHandle, workerId, startTime: Date.now() });

    try {
      // Use McpDiscoveryService to handle task execution on the specific worker
      const result = await this.executeWithRetry(
        () => this.mcpDiscovery.executeTaskOnWorker(worker.id, task), // Assuming McpDiscoveryService has this method
        retryPolicy,
        taskId
      );
      // Task completed successfully
      this.handleTaskSuccess(taskId, workerId, result);
    } catch (error) {
      // Task failed after retries or due to non-retryable error
      this.handleTaskFailure(taskId, workerId, error);
    } finally {
      // Ensure timeout is cleared and task is removed from active map
      // This might run before or after handleSuccess/handleFailure/handleTimeout
      const taskInfo = this.activeTasks.get(taskId);
      if (taskInfo && taskInfo.timeoutHandle) {
        clearTimeout(taskInfo.timeoutHandle);
      }
      if (this.activeTasks.has(taskId)) {
         this.activeTasks.delete(taskId);
         this.decrementWorkerLoad(workerId); // Decrement load only if it was truly active
         this.logger.debug(`Task ${taskId} removed from active tasks. Worker ${workerId} load: ${this.workerLoad.get(workerId) || 0}`);
         // Trigger queue processing as a worker might be free now
         this.triggerProcessing();
      }
    }
  }

  /**
   * Executes a function with a retry policy.
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    policy: RetryPolicy,
    taskId: string // For logging
  ): Promise<T> {
    let attempts = 0;
    // Use the correct property name 'delay' from the DTO
    let delay = policy.delay || 1000; 

    while (attempts < policy.maxAttempts) {
      attempts++;
      try {
        this.logger.debug(`Task ${taskId}: Attempt ${attempts}/${policy.maxAttempts}`);
        return await fn();
      } catch (error) {
        this.logger.warn(`Task ${taskId}: Attempt ${attempts} failed: ${error.message}`);
        if (attempts >= policy.maxAttempts) {
          this.logger.error(`Task ${taskId}: Max retry attempts (${policy.maxAttempts}) exceeded.`);
          throw error; // Rethrow after max attempts
        }

        // Check if the error is retryable (optional, depends on error types)
        // if (!this.isErrorRetryable(error)) {
        //   throw error;
        // }

        this.logger.log(`Task ${taskId}: Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * (policy.backoffFactor || 2), policy.maxDelay || 60000); // Apply backoff factor and max delay
      }
    }
    // This line should technically be unreachable due to the throw inside the loop
    throw new Error(`Task ${taskId}: Max retry attempts exceeded (logic error)`);
  }

  private handleTaskSuccess(taskId: string, workerId: string, result: any): void {
    const duration = this.getTaskDuration(taskId);
    this.logger.log(`Task ${taskId} completed successfully on worker ${workerId} in ${duration}ms.`);
    // TODO: Handle successful result (e.g., store it, notify other services)
    // console.log("Task Result:", result);
  }

  private handleTaskFailure(taskId: string, workerId: string, error: Error): void {
     const duration = this.getTaskDuration(taskId);
    this.logger.error(`Task ${taskId} failed permanently on worker ${workerId} after ${duration}ms: ${error.message}`, error.stack);
    // TODO: Handle permanent failure (e.g., log to dead-letter queue, notify admin)
  }

  private handleTimeout(taskId: string, workerId: string): void {
    // Check if the task is still considered active (it might have finished just before the timeout fired)
    if (this.activeTasks.has(taskId)) {
      const duration = this.getTaskDuration(taskId);
      this.logger.error(`Task ${taskId} timed out on worker ${workerId} after ${duration}ms.`);
      // Trigger failure handling logic for timeout
      this.handleTaskFailure(taskId, workerId, new Error(`Task timed out after ${duration}ms`));

      // Clean up active task state (will also be cleaned up in executeTask's finally block, but good to be explicit)
      this.activeTasks.delete(taskId);
      this.decrementWorkerLoad(workerId);
      this.logger.debug(`Task ${taskId} removed from active tasks due to timeout. Worker ${workerId} load: ${this.workerLoad.get(workerId) || 0}`);
      // Trigger queue processing as a worker might be free now
      this.triggerProcessing();
    } else {
       this.logger.debug(`Timeout fired for task ${taskId}, but it was already completed or failed.`);
    }
  }

  private getTaskDuration(taskId: string): number {
     const taskInfo = this.activeTasks.get(taskId);
     return taskInfo ? Date.now() - taskInfo.startTime : -1;
  }

  private incrementWorkerLoad(workerId: string): void {
    const currentLoad = this.workerLoad.get(workerId) || 0;
    this.workerLoad.set(workerId, currentLoad + 1);
  }

  private decrementWorkerLoad(workerId: string): void {
    const currentLoad = this.workerLoad.get(workerId) || 0;
    this.workerLoad.set(workerId, Math.max(0, currentLoad - 1)); // Ensure load doesn't go below 0
  }

  // --- Placeholder/Removed Methods ---

  // Removed validateResources as it's too basic here. Resource validation might happen elsewhere or be more complex.
  // private async validateResources() {
  //   this.logger.log('Validating system resources...');
  //   const workers = await this.mcpDiscovery.getAvailableWorkers();
  //   if (workers.length === 0) {
  //     this.logger.error('No available worker nodes found during validation.');
  //     // Depending on requirements, might throw an error or just log
  //     // throw new Error('No available worker nodes');
  //   }
  // }

  // Removed optimizeTaskRouting - Optimization logic can be complex and might belong in a separate service or be part of LLM interaction.
  // private async optimizeTaskRouting(plan: ExecutionPlanDto): Promise<ExecutionPlanDto> {
  //   // Placeholder for LLM-based optimization or rule-based routing
  //   this.logger.log('Applying task routing optimization...');
  //   // const optimized = await this.llmAdapter.optimizePlan(plan); // Example LLM call
  //   return this.applySchedulingPolicies(plan); // Apply basic policies like priority sorting
  // }

  // Removed applySchedulingPolicies - Basic priority sorting is now done when adding to the queue.
  // private applySchedulingPolicies(plan: ExecutionPlanDto): ExecutionPlanDto {
  //   // Simple priority-based sorting
  //   return {
  //     ...plan,
  //     tasks: plan.tasks.sort((a, b) => b.priority - a.priority)
  //   };
  // }

  // Removed distributeTasks and executeTaskBatch as we now process tasks individually.
}
