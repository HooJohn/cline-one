import { Test, TestingModule } from '@nestjs/testing';
import { McpDiscoveryService } from '../../../src/mcp-gateway/discovery/mcp-discovery.service';
import { ServerRegistry } from '../../../src/mcp-gateway/discovery/server-registry';
import { McpConfigService } from '../../../src/mcp-gateway/config/mcp-config.service';
import { WorkflowTaskDto } from '../../../src/orchestration/dto/workflow-task.dto';
import { NotFoundException } from '@nestjs/common';
import { McpServer, McpServerConfig } from '../../../src/interfaces/mcp-server.interface';

describe('McpDiscoveryService', () => {
  let service: McpDiscoveryService;
  let registry: ServerRegistry;
  let configService: McpConfigService;
  let protocolAdapters: any;

  const mockHttpAdapter = {
    discover: jest.fn(),
    checkHeartbeat: jest.fn(),
    executeTask: jest.fn(),
  };

  const mockSseAdapter = {
    discover: jest.fn(),
    checkHeartbeat: jest.fn(),
    executeTask: jest.fn(),
  };

  const mockWebSocketAdapter = {
    discover: jest.fn(),
    checkHeartbeat: jest.fn(),
    executeTask: jest.fn(),
  };

  const mockServer: McpServer = {
    id: 'test-server',
    name: 'Test Server',
    protocol: 'http',
    version: '2.3.1',
    status: 'connected',
    lastSeen: Date.now(),
    lastHeartbeat: Date.now(),
    capabilities: {
      tools: ['test-tool'],
      resources: ['test-resource'],
      resourceTemplates: ['test-template'],
      includes: (capability: string) => 
        ['test-tool', 'test-resource', 'test-template'].includes(capability)
    },
    config: {
      id: 'test-server',
      protocol: 'http',
      endpoint: 'http://localhost:3000'
    },
    metrics: {
      cpuUsage: 20,
      memoryUsage: 30,
      avgLatency: 50,
      errorRate: 0.05,
      errorCount: 1,
      totalTasks: 20,
      taskQueueSize: 0,
      lastUpdated: Date.now()
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpDiscoveryService,
        {
          provide: ServerRegistry,
          useValue: {
            register: jest.fn(),
            getServer: jest.fn(),
            getAllServers: jest.fn(),
            updateStatus: jest.fn(),
            updateServer: jest.fn(),
            logError: jest.fn(),
          },
        },
        {
          provide: McpConfigService,
          useValue: {
            getServerConfigs: jest.fn(),
          },
        },
        {
          provide: 'PROTOCOL_ADAPTERS',
          useValue: {
            http: mockHttpAdapter,
            sse: mockSseAdapter,
            websocket: mockWebSocketAdapter,
          },
        },
      ],
    }).compile();

    service = module.get<McpDiscoveryService>(McpDiscoveryService);
    registry = module.get<ServerRegistry>(ServerRegistry);
    configService = module.get<McpConfigService>(McpConfigService);
    protocolAdapters = module.get('PROTOCOL_ADAPTERS');
  });

  it('应该正确初始化', () => {
    expect(service).toBeDefined();
  });

  describe('服务发现', () => {
    it('应该发现可用的MCP服务器', async () => {
      const mockConfigs: McpServerConfig[] = [
        {
          id: 'http-server',
          protocol: 'http',
          endpoint: 'http://localhost:3000',
        },
        {
          id: 'ws-server',
          protocol: 'ws',
          endpoint: 'ws://localhost:3001',
        },
      ];

      const mockHttpServer = { ...mockServer, id: 'http-server', protocol: 'http' };
      const mockWsServer = { ...mockServer, id: 'ws-server', protocol: 'ws' };

      (configService.getServerConfigs as jest.Mock).mockReturnValue(mockConfigs);
      (mockHttpAdapter.discover as jest.Mock).mockResolvedValue(mockHttpServer);
      (mockWebSocketAdapter.discover as jest.Mock).mockResolvedValue(mockWsServer);
      (registry.register as jest.Mock).mockImplementation(server => server);

      await service.discoverServers();

      expect(configService.getServerConfigs).toHaveBeenCalled();
      expect(mockHttpAdapter.discover).toHaveBeenCalled();
      expect(mockWebSocketAdapter.discover).toHaveBeenCalled();
      expect(registry.register).toHaveBeenCalledTimes(2);
    });

    it('应该处理服务发现过程中的错误', async () => {
      const mockConfigs: McpServerConfig[] = [
        {
          id: 'error-server',
          protocol: 'http',
          endpoint: 'http://localhost:4000',
        },
      ];

      (configService.getServerConfigs as jest.Mock).mockReturnValue(mockConfigs);
      (mockHttpAdapter.discover as jest.Mock).mockRejectedValue(new Error('连接失败'));

      await service.discoverServers();

      expect(registry.logError).toHaveBeenCalled();
    });
  });

  describe('服务健康检查', () => {
    it('应该检查服务心跳并更新状态为健康', async () => {
      (registry.getServer as jest.Mock).mockReturnValue({ ...mockServer, protocol: 'http' });
      (mockHttpAdapter.checkHeartbeat as jest.Mock).mockResolvedValue(true);

      const result = await service.checkHeartbeat('test-server');

      expect(result).toBe(true);
      expect(registry.updateStatus).toHaveBeenCalledWith('test-server', 'connected');
    });

    it('应该检查服务心跳并更新状态为不健康', async () => {
      (registry.getServer as jest.Mock).mockReturnValue({ ...mockServer, protocol: 'http' });
      (mockHttpAdapter.checkHeartbeat as jest.Mock).mockResolvedValue(false);

      const result = await service.checkHeartbeat('test-server');

      expect(result).toBe(false);
      expect(registry.updateStatus).toHaveBeenCalledWith('test-server', 'unhealthy');
    });

    it('当服务不存在时应该抛出错误', async () => {
      (registry.getServer as jest.Mock).mockReturnValue(null);

      await expect(service.checkHeartbeat('non-existent'))
        .rejects
        .toThrow('Server non-existent not found');
    });
  });

  describe('任务执行', () => {
    it('应该在最优工作节点上执行任务', async () => {
      const task: WorkflowTaskDto = {
        taskId: 'test-task',
        type: 'workflow',
        payload: { data: 'test-data' },
        dataSources: [],
        modelType: 'deepseek' as any,
        priority: 1,
        resourceEstimate: {},
        timeout: 30000,
        retryPolicy: {
          maxAttempts: 3,
          delay: 1000,
          backoffFactor: 2,
          maxDelay: 10000,
          retryableErrors: ['ECONNRESET', 'ETIMEDOUT', '5xx']
        }
      };

      const mockWorkers = [
        { ...mockServer, id: 'worker1', currentLoad: 10, capacity: 100 },
        { ...mockServer, id: 'worker2', currentLoad: 5, capacity: 100 },
      ];

      (registry.getAllServers as jest.Mock).mockReturnValue(mockWorkers);
      
      const optimalWorker = await service.getOptimalWorker(task);
      
      expect(optimalWorker.id).toBe('worker2'); // 应该选择负载较低的worker2
    });

    it('应该在指定工作节点上执行任务', async () => {
      const task: WorkflowTaskDto = {
        taskId: 'test-task',
        type: 'workflow',
        payload: { data: 'test-data' },
        dataSources: [],
        modelType: 'deepseek' as any,
        priority: 1,
        resourceEstimate: {},
        timeout: 30000,
        retryPolicy: {
          maxAttempts: 3,
          delay: 1000,
          backoffFactor: 2,
          maxDelay: 10000,
          retryableErrors: ['ECONNRESET', 'ETIMEDOUT', '5xx']
        }
      };

      const mockWorker = { 
        ...mockServer, 
        id: 'worker1', 
        protocol: 'http', 
        currentLoad: 10, 
        capacity: 100 
      };

      (registry.getServer as jest.Mock).mockReturnValue(mockWorker);
      (mockHttpAdapter.executeTask as jest.Mock).mockResolvedValue({ result: 'success' });

      const result = await service.executeTaskOnWorker('worker1', task);

      expect(result).toEqual({ result: 'success' });
      expect(registry.updateServer).toHaveBeenCalled();
    });

    it('当工作节点不存在时应该抛出NotFound异常', async () => {
      const task: WorkflowTaskDto = {
        taskId: 'test-task',
        type: 'workflow',
        payload: { data: 'test-data' },
        dataSources: [],
        modelType: 'deepseek' as any,
        priority: 1,
        resourceEstimate: {},
        timeout: 30000,
        retryPolicy: {
          maxAttempts: 3,
          delay: 1000,
          backoffFactor: 2,
          maxDelay: 10000,
          retryableErrors: ['ECONNRESET', 'ETIMEDOUT', '5xx']
        }
      };

      (registry.getServer as jest.Mock).mockReturnValue(null);

      await expect(service.executeTaskOnWorker('non-existent', task))
        .rejects
        .toThrow(NotFoundException);
    });

    it('当任务执行失败时应该更新错误指标', async () => {
      const task: WorkflowTaskDto = {
        taskId: 'test-task',
        type: 'workflow',
        payload: { data: 'test-data' },
        dataSources: [],
        modelType: 'deepseek' as any,
        priority: 1,
        resourceEstimate: {},
        timeout: 30000,
        retryPolicy: {
          maxAttempts: 3,
          delay: 1000,
          backoffFactor: 2,
          maxDelay: 10000,
          retryableErrors: ['ECONNRESET', 'ETIMEDOUT', '5xx']
        }
      };

      const mockWorker = { 
        ...mockServer, 
        id: 'worker1', 
        protocol: 'http', 
        currentLoad: 10, 
        capacity: 100,
        metrics: {
          cpuUsage: 20,
          memoryUsage: 30,
          avgLatency: 50,
          errorRate: 0.05,
          errorCount: 1,
          totalTasks: 20,
          taskQueueSize: 1,
          lastUpdated: Date.now()
        }
      };

      (registry.getServer as jest.Mock).mockReturnValue(mockWorker);
      (mockHttpAdapter.executeTask as jest.Mock).mockRejectedValue(new Error('任务执行失败'));

      await expect(service.executeTaskOnWorker('worker1', task))
        .rejects
        .toThrow();

      expect(registry.updateServer).toHaveBeenCalled();
      // 验证错误指标已更新
      expect(registry.updateServer).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: expect.objectContaining({
            errorCount: 2,
            errorRate: expect.any(Number),
            taskQueueSize: 0
          })
        })
      );
    });
  });
});
