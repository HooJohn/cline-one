import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../../src/app.controller';
import { ResourceOptimizerService } from '../../src/orchestration/resource-optimizer.service';

describe('AppController', () => {
  let controller: AppController;
  let mockResourceOptimizer: jest.Mocked<ResourceOptimizerService>;

  beforeEach(async () => {
    mockResourceOptimizer = {
      getMetrics: jest.fn().mockResolvedValue({
        cpuUsage: 0.5,
        memoryUsage: 0.3,
        requestCount: 1000
      })
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: ResourceOptimizerService,
          useValue: mockResourceOptimizer
        }
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMetrics', () => {
    it('should return metrics', async () => {
      const result = await controller.getMetrics();

      expect(result).toEqual({
        cpuUsage: 0.5,
        memoryUsage: 0.3,
        requestCount: 1000
      });
      expect(mockResourceOptimizer.getMetrics).toHaveBeenCalled();
    });
  });
}); 