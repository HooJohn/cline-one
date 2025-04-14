import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../src/core/data-relation.service';
import { createMockRedisService } from '../../test/__mocks__/redis.types';
import { ResourceOptimizerService } from '../../src/orchestration/resource-optimizer.service';
import { McpDiscoveryService } from '../../src/mcp-gateway/discovery/mcp-discovery.service';
import { LlmAdapterService } from '../../src/llm/llm-adapter.service';
import { ConfigService } from '@nestjs/config';
import { WorkflowTaskDto } from '../../src/orchestration/dto/workflow-task.dto';
import { ModelIntegrationType } from '../../src/core/enums/model-integration-type.enum';
import { RetryPolicy } from '../../src/core/dto/retry-policy.dto';

describe('ResourceOptimizerService', () => {
  let service: ResourceOptimizerService;
  let mockMcpDiscovery: any;
  let mockLlmAdapter: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockMcpDiscovery = {
      getAvailableWorkers: jest.fn(),
      executeTaskOnWorker: jest.fn()
    };

    mockLlmAdapter = {
      estimateCost: jest.fn(),
      getCurrentModelInfo: jest.fn()
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(3)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceOptimizerService,
        {
          provide: McpDiscoveryService,
          useValue: mockMcpDiscovery
        },
        {
          provide: LlmAdapterService,
          useValue: mockLlmAdapter
        },
        {
          provide: ConfigService,
          useValue: mockConfigService
        },
        {
          provide: RedisService,
          useValue: createMockRedisService()
        },
        {
          provide: 'TaskSchedulerService',
          useValue: {
            scheduleTask: jest.fn()
          }
        }
      ],
    }).compile();

    service = module.get<ResourceOptimizerService>(ResourceOptimizerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('predictTaskCost', () => {
    it('should predict cost for LLM task', async () => {
      const task: WorkflowTaskDto = {
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

      const result = await service.predictTaskCost(task);

      expect(result).toBeDefined();
      expect(result.estimatedTokens).toBeDefined();
      expect(result.estimatedTokens).toBe(3000); // priority * promptLength
    });

    it('should handle non-LLM tasks', async () => {
      const task: WorkflowTaskDto = {
        taskId: 'test-task-1',
        type: 'other',
        payload: { data: 'test data' },
        dataSources: [],
        modelType: ModelIntegrationType.CUSTOM,
        priority: 3,
        resourceEstimate: {
          cpu: 1,
          memory: 512
        },
        timeout: 30000,
        retryPolicy: new RetryPolicy()
      };

      const result = await service.predictTaskCost(task);

      expect(result).toBeDefined();
      expect(result.estimatedTokens).toBeUndefined();
    });
  });

  describe('findOptimalWorker', () => {
    it('should find optimal worker based on health and cost', async () => {
      const task: WorkflowTaskDto = {
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

      const mockWorkers = [
        {
          id: 'worker-1',
          status: 'healthy',
          lastHeartbeat: Date.now(),
          metrics: {
            cpuUsage: 30,
            memoryUsage: 40,
            errorRate: 0.01
          }
        },
        {
          id: 'worker-2',
          status: 'healthy',
          lastHeartbeat: Date.now(),
          metrics: {
            cpuUsage: 60,
            memoryUsage: 70,
            errorRate: 0.05
          }
        }
      ];

      mockMcpDiscovery.getAvailableWorkers.mockResolvedValue(mockWorkers);

      const result = await service.findOptimalWorker(task);

      expect(result).toBe('worker-1');
      expect(mockMcpDiscovery.getAvailableWorkers).toHaveBeenCalled();
    });

    it('should return null when no workers are available', async () => {
      const task: WorkflowTaskDto = {
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

      mockMcpDiscovery.getAvailableWorkers.mockResolvedValue([]);

      const result = await service.findOptimalWorker(task);

      expect(result).toBeNull();
      expect(mockMcpDiscovery.getAvailableWorkers).toHaveBeenCalled();
    });

    it('should handle worker evaluation errors', async () => {
      const task: WorkflowTaskDto = {
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

      mockMcpDiscovery.getAvailableWorkers.mockRejectedValue(new Error('Failed to get workers'));

      await expect(service.findOptimalWorker(task)).rejects.toThrow('Failed to get workers');
    });
  });
});
