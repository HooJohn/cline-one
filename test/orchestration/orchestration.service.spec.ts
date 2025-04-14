import { Test, TestingModule } from '@nestjs/testing';
import { OrchestrationService } from '../../src/orchestration/orchestration.service';
import { McpDiscoveryService } from '../../src/mcp-gateway/discovery/mcp-discovery.service';
import { LlmAdapterService } from '../../src/llm/llm-adapter.service';
import { WorkflowTaskDto } from '../../src/orchestration/dto/workflow-task.dto';
import { ModelIntegrationType } from '../../src/core/enums/model-integration-type.enum';
import { RetryPolicy } from '../../src/core/dto/retry-policy.dto';

describe('OrchestrationService', () => {
  let service: OrchestrationService;
  let mockMcpDiscovery: any;
  let mockLlmAdapter: any;

  beforeEach(async () => {
    mockMcpDiscovery = {
      getOptimalWorker: jest.fn(),
      executeTaskOnWorker: jest.fn()
    };

    mockLlmAdapter = {
      generateCompletion: jest.fn(),
      getCurrentModelInfo: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestrationService,
        {
          provide: McpDiscoveryService,
          useValue: mockMcpDiscovery
        },
        {
          provide: LlmAdapterService,
          useValue: mockLlmAdapter
        }
      ],
    }).compile();

    service = module.get<OrchestrationService>(OrchestrationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeWorkflow', () => {
    it('should execute a workflow successfully', async () => {
      const workflow: WorkflowTaskDto = {
        taskId: 'test-workflow-1',
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

      const mockWorker = { id: 'worker-1' };
      const mockResult = { status: 'success', data: 'test result' };

      mockMcpDiscovery.getOptimalWorker.mockResolvedValue(mockWorker);
      mockMcpDiscovery.executeTaskOnWorker.mockResolvedValue(mockResult);

      const result = await service.executeWorkflow(workflow);

      expect(result).toBeDefined();
      expect(mockMcpDiscovery.getOptimalWorker).toHaveBeenCalledWith(workflow);
      expect(mockMcpDiscovery.executeTaskOnWorker).toHaveBeenCalledWith(mockWorker.id, workflow);
    });

    it('should handle workflow execution errors', async () => {
      const workflow: WorkflowTaskDto = {
        taskId: 'test-workflow-1',
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

      mockMcpDiscovery.getOptimalWorker.mockRejectedValue(new Error('Failed to get worker'));

      await expect(service.executeWorkflow(workflow)).rejects.toThrow('Failed to get worker');
    });
  });

  describe('scheduleTask', () => {
    it('should schedule a task successfully', async () => {
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

      const mockWorker = { id: 'worker-1' };
      const mockResult = { status: 'scheduled', taskId: task.taskId };

      mockMcpDiscovery.getOptimalWorker.mockResolvedValue(mockWorker);
      mockMcpDiscovery.executeTaskOnWorker.mockResolvedValue(mockResult);

      const result = await service.scheduleTask(task);

      expect(result).toBeDefined();
      expect(result).toEqual(mockResult);
      expect(mockMcpDiscovery.getOptimalWorker).toHaveBeenCalledWith(task);
      expect(mockMcpDiscovery.executeTaskOnWorker).toHaveBeenCalledWith(mockWorker.id, task);
    });

    it('should handle task scheduling errors', async () => {
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

      mockMcpDiscovery.getOptimalWorker.mockRejectedValue(new Error('Failed to get worker'));

      await expect(service.scheduleTask(task)).rejects.toThrow('Failed to get worker');
    });
  });

  describe('handleExecution', () => {
    it('should handle LLM execution successfully', async () => {
      const prompt = 'test prompt';
      const mockResult = 'test completion';
      const mockModelInfo = { name: 'gpt-4', version: '1.0' };

      mockLlmAdapter.generateCompletion.mockResolvedValue(mockResult);
      mockLlmAdapter.getCurrentModelInfo.mockReturnValue(mockModelInfo);

      const result = await service.handleExecution(prompt);

      expect(result).toEqual({
        success: true,
        response: mockResult,
        metadata: {
          model: mockModelInfo,
          timestamp: expect.any(String)
        }
      });
      expect(mockLlmAdapter.generateCompletion).toHaveBeenCalledWith(prompt);
    });

    it('should handle LLM execution errors', async () => {
      const prompt = 'test prompt';
      mockLlmAdapter.generateCompletion.mockRejectedValue(new Error('LLM error'));

      const result = await service.handleExecution(prompt);

      expect(result).toEqual({
        success: false,
        error: 'LLM error',
        timestamp: expect.any(String)
      });
    });
  });
}); 