import { Test, TestingModule } from '@nestjs/testing';
import { TaskQueueProcessor } from '../../src/task-queue/task-queue.processor';
import { McpDiscoveryService } from '../../src/mcp-gateway/discovery/mcp-discovery.service';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import { WorkflowTaskDto } from '../../src/orchestration/dto/workflow-task.dto';
import { Logger } from '@nestjs/common';

describe('TaskQueueProcessor', () => {
  let processor: TaskQueueProcessor;
  let mockMcpDiscovery: any;
  let mockConfigService: any;
  let mockLogger: {
    log: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    debug: jest.Mock;
  };

  beforeEach(async () => {
    mockMcpDiscovery = {
      getOptimalWorker: jest.fn(),
      executeTaskOnWorker: jest.fn()
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(3)
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskQueueProcessor,
        {
          provide: McpDiscoveryService,
          useValue: mockMcpDiscovery
        },
        {
          provide: ConfigService,
          useValue: mockConfigService
        },
        {
          provide: Logger,
          useValue: mockLogger
        }
      ],
    }).compile();

    processor = module.get<TaskQueueProcessor>(TaskQueueProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleTask', () => {
    it('should process a task successfully', async () => {
      const mockJob: Partial<Job<WorkflowTaskDto>> = {
        id: 'job-1',
        data: {
          taskId: 'task-1',
          type: 'test',
          payload: { data: 'test data' }
        } as WorkflowTaskDto
      };

      const mockWorker = { id: 'worker-1' };
      const mockResult = { status: 'success' };

      mockMcpDiscovery.getOptimalWorker.mockResolvedValue(mockWorker);
      mockMcpDiscovery.executeTaskOnWorker.mockResolvedValue(mockResult);

      const result = await processor.handleTask(mockJob as Job<WorkflowTaskDto>);

      expect(result).toBe(mockResult);
      expect(mockMcpDiscovery.getOptimalWorker).toHaveBeenCalledWith(mockJob.data);
      expect(mockMcpDiscovery.executeTaskOnWorker).toHaveBeenCalledWith(mockWorker.id, mockJob.data);
    });

    it('should handle validation errors', async () => {
      const mockJob: Partial<Job<WorkflowTaskDto>> = {
        id: 'job-1',
        data: {
          type: 'test', // 缺少 taskId
          payload: { data: 'test data' }
        } as WorkflowTaskDto
      };

      await expect(processor.handleTask(mockJob as Job<WorkflowTaskDto>)).rejects.toThrow('任务ID不能为空');
    });

    it('should handle worker unavailable errors', async () => {
      const mockJob: Partial<Job<WorkflowTaskDto>> = {
        id: 'job-1',
        data: {
          taskId: 'task-1',
          type: 'test',
          payload: { data: 'test data' }
        } as WorkflowTaskDto
      };

      mockMcpDiscovery.getOptimalWorker.mockResolvedValue(null);

      await expect(processor.handleTask(mockJob as Job<WorkflowTaskDto>)).rejects.toThrow('无法找到合适的工作节点');
    });
  });

  describe('Queue Events', () => {
    const mockJob: Partial<Job<WorkflowTaskDto>> = {
      id: 'job-1',
      data: {
        taskId: 'task-1',
        type: 'test',
        payload: { data: 'test data' }
      } as WorkflowTaskDto
    };

    it('should handle onActive event', async () => {
      await processor.onActive(mockJob as Job<WorkflowTaskDto>);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('任务开始处理：'),  // Add colon to match actual message
        expect.objectContaining({  // Use more specific object matching
          jobId: mockJob.id,
          taskId: mockJob.data.taskId
        })
      );
    });

    it('should handle onCompleted event', async () => {
      const result = { status: 'success' };
      await processor.onCompleted(mockJob as Job<WorkflowTaskDto>, result);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('任务处理完成：'),  // Add colon to match actual message
        expect.objectContaining({
          jobId: mockJob.id,
          taskId: mockJob.data.taskId,
          result
        })
      );
    });

    it('should handle onFailed event', async () => {
      const error = new Error('Task execution failed');
      await processor.onFailed(mockJob as Job<WorkflowTaskDto>, error);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('任务处理失败：'),  // Add colon to match actual message
        expect.objectContaining({
          jobId: mockJob.id,
          taskId: mockJob.data.taskId,
          error: expect.any(Error)
        })
      );
    });
  });
});
