// Combined and cleaned imports
import { Injectable, Logger, Inject, NotFoundException, InternalServerErrorException } from '@nestjs/common'; 
import { ServerRegistry } from './server-registry';
import { McpServer, ServerStatus } from '../interfaces/mcp-server.interface';
import { McpConfigService } from '../config/mcp-config.service';
import { ProtocolAdapters } from '../protocol/protocol-adapters.type';
import { WorkflowTaskDto } from '../../orchestration/dto/workflow-task.dto'; // Added import for WorkflowTaskDto
import { McpWorker } from '../interfaces/mcp-server.interface';

@Injectable()
export class McpDiscoveryService implements McpDiscoveryService {
  private readonly serverRegistry = new Map<string, McpServer>();
  async getOptimalWorker(task: WorkflowTaskDto): Promise<McpWorker> {
    // 实现基于负载均衡算法选择最优节点
    const availableWorkers = this.getAvailableWorkers();
    return availableWorkers[0]; // 示例实现，应替换为实际算法
  }

  // 补充缺失的辅助方法
  public getAvailableWorkers(): McpWorker[] {
    return Array.from(this.serverRegistry.values()).filter(
      s => s.status === 'healthy' || s.status === 'connected'
    ) as McpWorker[];
  }

  private getWorkerById(workerId: string): McpWorker {
    const worker = this.serverRegistry.get(workerId);
    if (!worker) throw new Error(`Worker ${workerId} not found`);
    return worker as McpWorker;
  }
  private readonly logger = new Logger(McpDiscoveryService.name);

  async registerServer(config: any): Promise<any> {
    const adapter = this.adapters[config.protocol];
    const server = await adapter.discover(config);
    if (this.registry.getServer(server.id)) {
      throw new Error('服务器已存在');
    }
    return this.registry.register(server);
  }
  
  constructor(
    private readonly registry: ServerRegistry,
    private readonly config: McpConfigService,
    @Inject('PROTOCOL_ADAPTERS') private readonly adapters: ProtocolAdapters
  ) {}

  async discoverServers(): Promise<void> {
    const configs = this.config.getServerConfigs();
    
    for (const config of configs) {
      try {
        const adapter = this.adapters[config.protocol];
        const server = await adapter.discover(config);
        
        if (server) {
          this.registry.register(server);
          this.logger.log(`Discovered MCP server: ${server.id}`);
        }
      } catch (error) {
          this.registry.logError(`Discovery failed for ${config.id}`, error);
      }
    }
  }

  startHeartbeatCheck(interval = 30000): void {
    setInterval(async () => {
      for (const server of this.registry.getAllServers()) {
        try {
          const isAlive = await this.adapters[server.protocol].checkHeartbeat(server);
          this.registry.updateStatus(server.id, isAlive ? 'healthy' : 'unhealthy');
        } catch (error) {
          this.registry.updateStatus(server.id, 'unhealthy');
        }
      }
    }, interval);
  }

  verifyCompatibility(server: McpServer): boolean {
    const [major] = server.version.split('.').map(Number);
    return major >= 2; // 要求MCP协议主版本≥2
  }


  async checkHeartbeat(serverId: string): Promise<boolean> {
    const server = this.registry.getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    
    try {
      const isAlive = await this.adapters[server.protocol].checkHeartbeat(server);
      this.registry.updateStatus(server.id, isAlive ? 'connected' : 'unhealthy');
      return isAlive;
    } catch (error) {
      this.registry.updateStatus(server.id, 'unhealthy');
      return false;
    }
  }

  /**
   * Returns a list of all servers currently held in the registry.
   * @returns An array of McpServer objects.
   */
  getAllRegisteredServers(): McpServer[] {
    return this.registry.getAllServers();
  }

  /**
   * Executes a task on a specific worker identified by its ID.
   * @param workerId The ID of the MCP server (worker) to execute the task on.
   * @param task The workflow task DTO containing task details.
   * @returns The result of the task execution from the worker.
   * @throws NotFoundException if the worker is not found in the registry.
   * @throws InternalServerErrorException if the worker is found but not healthy or if the protocol adapter fails.
   */
  async executeTaskOnWorker(workerId: string, task: WorkflowTaskDto): Promise<any> {
    this.logger.log(`Attempting to execute task ${task.taskId} on worker ${workerId}`);
    const server = this.registry.getServer(workerId);

    if (!server) {
      this.logger.error(`Worker ${workerId} not found in registry.`);
      throw new NotFoundException(`Worker ${workerId} not found`);
    }

    // Optional: Add more sophisticated status checks if needed
    if (server.status !== 'healthy' && server.status !== 'connected') {
       this.logger.error(`Worker ${workerId} is not in a healthy or connected state (current: ${server.status}). Cannot execute task ${task.taskId}.`);
       throw new InternalServerErrorException(`Worker ${workerId} is not healthy (status: ${server.status})`);
    }

    try {
      const adapter = this.adapters[server.protocol];
      
      // Check if the adapter exists
      if (!adapter) {
         this.logger.error(`No protocol adapter found for worker ${workerId} (protocol: ${server.protocol})`);
         throw new InternalServerErrorException(`Protocol adapter for ${server.protocol} not found on worker ${workerId}`);
      }

      // Type guard to check if executeTask exists on the specific adapter instance
      // We cast to 'any' to bypass the initial union type check, relying on the runtime check.
      if (typeof (adapter as any).executeTask !== 'function') { 
         this.logger.error(`Protocol adapter for ${server.protocol} on worker ${workerId} does not support executeTask.`);
         throw new InternalServerErrorException(`Worker ${workerId} (protocol: ${server.protocol}) does not support task execution.`);
      }
      
      this.logger.debug(`Delegating task ${task.taskId} execution to protocol adapter for worker ${workerId}`);
      // Now we know adapter.executeTask exists (due to the check above)
      // Assuming the adapter's executeTask method takes the server object and the task DTO
      const result = await (adapter as any).executeTask(server, task); 
      this.logger.log(`Task ${task.taskId} execution initiated successfully on worker ${workerId}.`);
      return result; // Return the result obtained from the adapter
    } catch (error) {
      this.logger.error(`Failed to execute task ${task.taskId} on worker ${workerId}: ${error.message}`, error.stack);
      // Rethrow a generic server error or the specific error if needed
      throw new InternalServerErrorException(`Failed to execute task on worker ${workerId}: ${error.message}`);
    }
  }
}
