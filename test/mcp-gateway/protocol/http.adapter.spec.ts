import { Test, TestingModule } from '@nestjs/testing';
import { HttpAdapter } from '../../../src/mcp-gateway/protocol/http.adapter';
import { createMockConfig, createMockServer } from '../../__mocks__/mcp.types';
import { McpServerConfig, McpServer, ServerStatus } from '../../../src/interfaces/mcp-server.interface';
import axios from 'axios';
import { WorkflowTaskDto } from '../../../src/orchestration/dto/workflow-task.dto';
import { ModelIntegrationType } from '../../../src/core/enums/model-integration-type.enum';
import { EventEmitter } from 'events';
import { RetryPolicy } from '../../../src/core/dto/retry-policy.dto';
import { AnalyzeDataRelationsDto } from '../../../src/core/dto/data-relation.dto';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    create: jest.fn(() => ({
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    })),
    isAxiosError: (error: any) => error?.isAxiosError,
    AxiosError: class AxiosError extends Error {
      isAxiosError = true
      constructor(message: string) {
        super(message)
      }
    }
  }
}));

describe('HttpAdapter', () => {
  let adapter: HttpAdapter;
  let mockConfig: McpServerConfig;
  let mockServer: McpServer;
  let mockTask: WorkflowTaskDto;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: HttpAdapter,
          useFactory: () => new HttpAdapter(3000)
        }
      ],
    }).compile();

    adapter = module.get<HttpAdapter>(HttpAdapter);
    mockConfig = {
      id: 'test-server-config',
      endpoint: 'http://localhost:3000',
      protocol: 'http'
    };
    mockServer = {
      id: 'test-server',
      name: 'Test Server',
      config: mockConfig,
      status: 'ACTIVE' as ServerStatus,
      protocol: 'http' as const,
      version: '1.0.0',
      lastSeen: Date.now(),
      lastHeartbeat: Date.now(),
      capabilities: {
        tools: [],
        resources: [],
        resourceTemplates: [],
        includes: (capability: string) => false
      },
      metrics: {
        cpuUsage: 0,
        memoryUsage: 0,
        avgLatency: 0,
        errorRate: 0,
        errorCount: 0,
        totalTasks: 0,
        lastUpdated: Date.now(),
        taskQueueSize: 0
      }
    };
    mockTask = {
      taskId: 'test-task-1',
      type: 'llm',
      payload: { prompt: 'test prompt' },
      dataSources: [],
      modelType: ModelIntegrationType.OPENAI,
      priority: 3,
      resourceEstimate: {
        promptLength: 1000,
        cpu: 1,
        memory: 512
      },
      timeout: 30000,
      retryPolicy: new RetryPolicy()
    };
    jest.clearAllMocks();
  });

  describe('discover', () => {
    it('should discover server capabilities', async () => {
      const expectedServer = createMockServer(mockConfig);
      const mockCapabilities = {
        tools: ['tool1', 'tool2'],
        resources: ['resource1', 'resource2'],
        resourceTemplates: ['template1', 'template2'],
        includes: jest.fn().mockImplementation((capability: string) => 
          ['tool1', 'tool2', 'resource1', 'resource2', 'template1', 'template2'].includes(capability)
        )
      };
      
      (axios.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: {
          name: expectedServer.name,
          version: expectedServer.version,
          capabilities: mockCapabilities
        }
      });
      
      const result = await adapter.discover(mockConfig);
      
      expect(result).toBeDefined();
      expect(result?.id).toBe(mockConfig.id);
      expect(result?.protocol).toBe('http');
      expect(result?.status).toBe('connected');
      expect(result?.config).toEqual(expect.objectContaining(mockConfig));
      expect(result?.capabilities).toMatchObject({
        tools: mockCapabilities.tools,
        resources: mockCapabilities.resources,
        resourceTemplates: mockCapabilities.resourceTemplates
      });
      expect(axios.get).toHaveBeenCalledWith(`${mockConfig.endpoint}/health`, {
        timeout: 5000,
        validateStatus: expect.any(Function)
      });
    });

    it('should handle discovery errors', async () => {
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      const result = await adapter.discover(mockConfig);
      expect(result).toBeNull();
      expect(axios.get).toHaveBeenCalledWith(`${mockConfig.endpoint}/health`, {
        timeout: 3000,
        validateStatus: expect.any(Function)
      });
    });

    it('should return null for unsupported protocol', async () => {
      const invalidConfig = { ...mockConfig, protocol: 'ws' as const };
      const result = await adapter.discover(invalidConfig);
      expect(result).toBeNull();
    });

    it('should handle invalid server configuration', async () => {
      const config = { ...mockConfig, endpoint: '' };
      
      const result = await adapter.discover(config);
      expect(result).toBeNull();
    });

    it('should handle connection errors', async () => {
      jest.spyOn(axios, 'get').mockRejectedValueOnce(new Error('Connection failed'));
      
      const result = await adapter.discover(mockConfig);
      expect(result).toBeNull();
    });

    it('should handle malformed server response', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: {
          invalid: true
        }
      });

      const result = await adapter.discover(mockConfig);
      expect(result).toBeNull();
    });

    it('should handle invalid capabilities', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: {
          // 完全无效的响应结构
          invalidField: true,
          version: 1, // 错误的版本类型
          capabilities: {
            tools: null, // 无效的工具类型
            resources: "invalid" // 无效的资源类型
          }
        }
      });

      const result = await adapter.discover(mockConfig);
      expect(result).toBeNull();
    });
  });

  describe('checkHeartbeat', () => {
    it('should check server heartbeat', async () => {
      const server = createMockServer(mockConfig);
      
      (axios.get as jest.Mock).mockResolvedValueOnce({
        status: 200
      });
      
      const result = await adapter.checkHeartbeat(server);
      
      expect(result).toBe(true);
      expect(axios.get).toHaveBeenCalledWith(`${mockConfig.endpoint}/health`, {
        timeout: 3000,
        validateStatus: expect.any(Function)
      });
    });

    it('should handle heartbeat errors', async () => {
      const server = createMockServer({
        ...mockConfig,
        endpoint: 'invalid-endpoint'
      });
      
      (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      const result = await adapter.checkHeartbeat(server);
      
      expect(result).toBe(false);
      expect(axios.get).toHaveBeenCalledWith(`invalid-endpoint/health`, {
        timeout: 3000,
        validateStatus: expect.any(Function)
      });
    });
  });

  describe('executeTask', () => {
    const mockServer = createMockServer({
      id: 'test-server-config',
      endpoint: 'http://localhost:3000',
      protocol: 'http'
    });

    it('should execute task successfully', async () => {
      const mockResponse = {
        status: 200,
        data: {
          taskId: mockTask.taskId,
          status: 'completed',
          result: { data: 'test-output' }
        }
      };

      (axios.post as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await adapter.executeTask(mockServer, mockTask);

      expect(result).toEqual(mockResponse.data);
      expect(axios.post).toHaveBeenCalledWith(
        `${mockConfig.endpoint}/tasks`,
        mockTask,
        expect.any(Object)
      );
    });

    it('should handle task execution timeout', async () => {
      jest.useFakeTimers();
      
      const mockPromise = new Promise((resolve) => {
        setTimeout(resolve, 5000);
      });
      
      (axios.post as jest.Mock).mockImplementationOnce(() => mockPromise);

      const executePromise = adapter.executeTask(mockServer, mockTask);
      
      await jest.advanceTimersByTimeAsync(10010); // Test timeout is 10000ms
      
      await expect(executePromise).rejects.toThrow('Task execution timeout');
      
      jest.useRealTimers();
    }, 10000);

    it('should handle network errors', async () => {
      const mockError = new Error('Network error');
      (axios.post as jest.Mock).mockRejectedValueOnce(mockError);

      await expect(adapter.executeTask(mockServer, mockTask))
        .rejects.toThrow('Network error');
    });

    it('should handle invalid server response', async () => {
      const mockInvalidResponse = {
        status: 200,
        data: {
          taskId: mockTask.taskId,
          status: 'invalid_status',  // 使用明显无效的状态
          result: null
        }
      };

      (axios.post as jest.Mock).mockRejectedValueOnce(
        new Error('Invalid task status: invalid_status')
      );

      await expect(adapter.executeTask(mockServer, mockTask))
        .rejects.toThrow('Invalid task status: invalid_status');
    });

    it('should handle invalid protocol', async () => {
      const invalidConfig = createMockConfig('test-server', 'ws' as any);
      
      const result = await adapter.discover(invalidConfig);
      expect(result).toBeNull();
    });
  });

  describe('discover with invalid configurations', () => {
    it('should handle empty endpoint', async () => {
      const invalidConfig = createMockConfig('test-server', 'http');
      invalidConfig.endpoint = '';

      const result = await adapter.discover(invalidConfig);
      expect(result).toBeNull();
    });

    it('should handle invalid protocol', async () => {
      const invalidConfig = { ...mockConfig, protocol: 'ws' as const };
      
      const result = await adapter.discover(invalidConfig);
      expect(result).toBeNull();
    });

    it('should handle malformed server response', async () => {
      (axios.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: {
          name: 'test-server',
          version: '1.0.0',
          capabilities: null  // 无效的 capabilities
        }
      });

      const result = await adapter.discover(mockConfig);
      expect(result).toBeNull();
    });
  });
});
