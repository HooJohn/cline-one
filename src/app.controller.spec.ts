import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { ResourceOptimizerService } from './orchestration/resource-optimizer.service';

describe('AppController', () => {
  let appController: AppController;
  let resourceOptimizer: ResourceOptimizerService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: ResourceOptimizerService,
          useValue: {
            getMetrics: jest.fn().mockResolvedValue('metrics data')
          }
        }
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    resourceOptimizer = app.get<ResourceOptimizerService>(ResourceOptimizerService);
  });

  describe('metrics', () => {
    it('should return metrics data', async () => {
      const result = await appController.getMetrics();
      expect(result).toBe('metrics data');
      expect(resourceOptimizer.getMetrics).toHaveBeenCalled();
    });
  });
});
