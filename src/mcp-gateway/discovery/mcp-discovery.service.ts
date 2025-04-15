// Combined and cleaned imports
import { Injectable, Logger, Inject, NotFoundException, InternalServerErrorException, OnModuleInit } from '@nestjs/common'; 
import { ServerRegistry } from './server-registry';
import { McpServer, ServerStatus } from '../../interfaces/mcp-server.interface';
import { McpConfigService } from '../config/mcp-config.service';
import { ProtocolAdapters } from '../protocol/protocol-adapters.type';
import { WorkflowTaskDto } from '../../orchestration/dto/workflow-task.dto';
import { McpWorker } from '../../interfaces/mcp-server.interface';
import { ServerMetrics } from '../../interfaces/mcp-server.interface';

@Injectable()
export class McpDiscoveryService implements McpDiscoveryService, OnModuleInit {
  private readonly logger = new Logger(McpDiscoveryService.name);
  private roundRobinIndex = 0;

  constructor(
    private readonly registry: ServerRegistry,
    private readonly config: McpConfigService,
    @Inject('PROTOCOL_ADAPTERS') private readonly adapters: ProtocolAdapters
  ) {}

  async onModuleInit() {
    await this.discoverServers();
    this.startHeartbeatCheck();
  }

  async registerServer(server: McpServer): Promise<McpServer> {
    const existingServer = this.registry.getServer(server.id);
    if (existingServer) {
      throw new Error('Server already registered');
    }

    const adapter = this.adapters[server.protocol];
    const discoveredServer = await adapter.discover(server.config);
    if (!discoveredServer) {
      throw new Error('Failed to discover server');
    }

    server.status = 'connected';
    server.lastHeartbeat = Date.now();
    server.capabilities = discoveredServer.capabilities;
    server.name = discoveredServer.name;
    server.version = discoveredServer.version;
    
    return this.registry.register(server);
  }

  public getAvailableWorkers(): McpWorker[] {
    return this.registry.getAllServers()
      .filter(s => s.status === 'healthy' || s.status === 'connected')
      .map(server => {
        const worker = {
          ...server,
          currentLoad: 0,
          capacity: 100
        } as McpWorker;

        // 计算当前负载
        if (worker.metrics) {
          worker.currentLoad = 
            worker.metrics.cpuUsage * 0.4 + // CPU使用权重40%
            worker.metrics.memoryUsage * 0.3 + // 内存使用权重30%
            (worker.metrics.taskQueueSize / worker.capacity) * 0.3; // 任务队列占比权重30%
        }

        return worker;
      });
  }

  private getWorkerById(workerId: string): McpWorker {
    const worker = this.registry.getServer(workerId);
    if (!worker) throw new NotFoundException(`Worker ${workerId} not found`);
    return worker as McpWorker;
  }

  async getOptimalWorker(task: WorkflowTaskDto): Promise<McpWorker> {
    const workers = this.getAvailableWorkers();
    if (!workers.length) {
      throw new NotFoundException('No workers available');
    }

    // 记录每个worker的负载数据以便调试
    workers.forEach(worker => {
      this.logger.debug(`Worker ${worker.id}: currentLoad=${worker.currentLoad}, taskQueueSize=${worker.metrics?.taskQueueSize || 0}, capacity=${worker.capacity}`);
    });

    // 简化排序逻辑，直接按currentLoad排序
    workers.sort((a, b) => {
      return a.currentLoad - b.currentLoad; // 升序排序，负载最低的在前
    });
    
    // 记录排序后的结果
    this.logger.debug(`Selected optimal worker: ${workers[0].id} with load ${workers[0].currentLoad}`);
    
    return workers[0]; // 返回负载最低的节点
  }

  async discoverServers(): Promise<void> {
    const configs = this.config.getServerConfigs();
    const discoveredServers = new Set<string>();
    
    // 首先处理配置中的服务器
    for (const config of configs) {
      try {
        const adapter = this.adapters[config.protocol];
        if (!adapter) {
          this.logger.warn(`No adapter found for protocol: ${config.protocol}`);
          continue;
        }

        const server = await adapter.discover(config);
        if (server) {
          this.registry.register(server);
          discoveredServers.add(server.id);
          this.logger.log(`Discovered MCP server: ${server.id}`);
        }
      } catch (error) {
        this.registry.logError(`Discovery failed for ${config.id}`, error as Error);
      }
    }
    
    // 始终尝试WebSocket发现
    if (this.adapters['ws']) {
      try {
        const wsServer = await this.adapters['ws'].discover();
        if (wsServer) {
          this.registry.register(wsServer);
          this.logger.log(`Discovered WebSocket MCP server: ${wsServer.id}`);
        }
      } catch (error) {
        this.registry.logError('WebSocket discovery failed', error as Error);
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
    const [major, minor, patch] = server.version.split('.').map(Number);
    // 要求协议版本≥2.3.1 或 ≥3.0.0
    return (major === 2 && minor >= 3 && patch >= 1) || major >= 3;
  }

  private calculateHealthScore(server: McpServer): number {
    // 综合健康评分算法（权重可配置）
    const weights = {
      cpu: 0.3,
      memory: 0.3,
      latency: 0.2,
      errorRate: 0.2
    };
    
    return Math.min(
      100,
      (100 - (server.metrics?.cpuUsage ?? 100)) * weights.cpu +
      (100 - (server.metrics?.memoryUsage ?? 100)) * weights.memory +
      (100 - Math.min(server.metrics?.avgLatency ?? 1000, 1000)/10) * weights.latency +
      (100 - ((server.metrics?.errorRate ?? 1) * 100)) * weights.errorRate
    );
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

  getRegisteredServers(): McpServer[] {
    return this.getAllRegisteredServers();
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
    const worker = this.getWorkerById(workerId);
    if (!worker) {
      throw new NotFoundException(`Worker ${workerId} not found`);
    }

    try {
      const adapter = this.adapters[worker.protocol];
      
      // 更新任务队列大小
      this.updateWorkerMetrics(worker, {
        taskQueueSize: ((worker.metrics?.taskQueueSize || 0) + 1)
      });

      const result = await adapter.executeTask(worker, task);
      
      // 更新成功执行的任务指标
      this.updateWorkerMetrics(worker, {
        totalTasks: (worker.metrics?.totalTasks || 0) + 1,
        taskQueueSize: Math.max(0, (worker.metrics?.taskQueueSize || 1) - 1),
        lastTaskTime: Date.now()
      });

      return result;
    } catch (error: unknown) {
      this.logger.error(`Failed to execute task on worker ${workerId}: ${error instanceof Error ? error.message : String(error)}`);
      
      // 更新错误指标，确保taskQueueSize为0
      this.updateWorkerMetrics(worker, {
        errorCount: (worker.metrics?.errorCount || 0) + 1,
        errorRate: ((worker.metrics?.errorCount || 0) + 1) / ((worker.metrics?.totalTasks || 0) + 1),
        taskQueueSize: 0 // 任务失败时，将队列大小设置为0
      });

      throw new InternalServerErrorException(`Task execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private updateWorkerMetrics(worker: McpWorker, metrics: Partial<ServerMetrics>): void {
    const currentMetrics = worker.metrics || {
      cpuUsage: 0,
      memoryUsage: 0,
      avgLatency: 0,
      errorRate: 0,
      errorCount: 0,
      totalTasks: 0,
      taskQueueSize: 0,
      lastUpdated: Date.now()
    };

    worker.metrics = {
      ...currentMetrics,
      ...metrics,
      lastUpdated: Date.now()
    };
    
    this.registry.updateServer(worker);
  }
}
