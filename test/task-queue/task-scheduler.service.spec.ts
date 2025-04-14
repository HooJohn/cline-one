import { Test, TestingModule } from '@nestjs/testing';
import { TaskSchedulerService } from '../../src/task-queue/task-scheduler.service';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';

describe('TaskSchedulerService', () => {
  let service: TaskSchedulerService;
  let mockQueue: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn(),
      process: jest.fn(),
      on: jest.fn(),
      getJob: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(3), // 默认重试次数为3
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskSchedulerService,
        {
          provide: getQueueToken('taskQueue'),
          useValue: mockQueue,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<TaskSchedulerService>(TaskSchedulerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scheduleTask', () => {
    it('should schedule a task successfully', async () => {
      const taskId = 'test-task-1';
      const taskPayload = {
        type: 'test',
        data: 'test data'
      };
      const mockJob = { id: 'job-1', data: { id: taskId, ...taskPayload } };

      mockQueue.add.mockResolvedValueOnce(mockJob);

      const result = await service.scheduleTask(taskId, taskPayload);

      expect(result).toBeDefined();
      expect(result).toEqual(mockJob);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process',
        { id: taskId, ...taskPayload },
        { attempts: 3 }
      );
    });

    it('should schedule a delayed task', async () => {
      const taskId = 'test-task-1';
      const taskPayload = {
        type: 'test',
        data: 'test data'
      };
      const delay = 5000;
      const mockJob = { id: 'job-1', data: { id: taskId, ...taskPayload } };

      mockQueue.add.mockResolvedValueOnce(mockJob);

      const result = await service.scheduleTask(taskId, taskPayload, delay);

      expect(result).toEqual(mockJob);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process',
        { id: taskId, ...taskPayload },
        { delay, attempts: 3 }
      );
    });

    it('should handle scheduling errors', async () => {
      const taskId = 'test-task-1';
      const taskPayload = {
        type: 'test',
        data: 'test data'
      };

      mockQueue.add.mockRejectedValueOnce(new Error('Queue error'));

      await expect(service.scheduleTask(taskId, taskPayload)).rejects.toThrow('Queue error');
    });
  });

  describe('scheduleDelayedTask', () => {
    it('should schedule a delayed task successfully', async () => {
      const taskId = 'test-task-1';
      const delayMs = 5000;
      const taskPayload = {
        type: 'test',
        data: 'test data'
      };
      const mockJob = { id: 'job-1', data: { id: taskId, ...taskPayload } };

      mockQueue.add.mockResolvedValueOnce(mockJob);

      const result = await service.scheduleDelayedTask(taskId, delayMs, taskPayload);

      expect(result).toEqual(mockJob);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'delayedTask',
        { id: taskId, ...taskPayload },
        { delay: delayMs, attempts: 3 }
      );
    });
  });

  describe('getJobStatus', () => {
    it('should return job state', async () => {
      const taskId = 'test-task-1';
      const mockJob = {
        id: 'job-1',
        data: { id: taskId },
        getState: jest.fn().mockResolvedValue('completed')
      };

      mockQueue.getJob.mockResolvedValueOnce(mockJob);

      const status = await service.getJobStatus(taskId);

      expect(status).toBeDefined();
      expect(status).toBe('completed');
      expect(mockQueue.getJob).toHaveBeenCalledWith(taskId);
    });

    it('should handle non-existent jobs', async () => {
      const taskId = 'non-existent-task';
      mockQueue.getJob.mockResolvedValueOnce(null);

      const status = await service.getJobStatus(taskId);

      expect(status).toBe('not_found');
      expect(mockQueue.getJob).toHaveBeenCalledWith(taskId);
    });
  });

  describe('executeTask', () => {
    it('should execute a task successfully', async () => {
      const taskId = 'test-task-1';
      const payload = {
        type: 'test',
        data: 'test data'
      };

      const result = await service.executeTask(taskId, payload);

      expect(result).toEqual({
        taskId,
        status: 'processed'
      });
    });
  });
}); 