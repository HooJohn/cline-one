import { Test, TestingModule } from '@nestjs/testing';
import { DataRelationController } from '../../src/core/data-relation.controller';
import { RedisService } from '../../src/core/data-relation.service';
import { AnalyzeDataRelationsDto } from '../../src/core/dto/data-relation.dto';
import { createMockRedisService } from '../__mocks__/redis.types';

describe('DataRelationController', () => {
  let controller: DataRelationController;
  let mockRedisService: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    mockRedisService = createMockRedisService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataRelationController],
      providers: [
        {
          provide: RedisService,
          useValue: mockRedisService
        }
      ],
    }).compile();

    controller = module.get<DataRelationController>(DataRelationController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeRelations', () => {
    it('should analyze relations successfully', async () => {
      const dto: AnalyzeDataRelationsDto = {
        sources: [
          {
            mcpServer: 'server1',
            resourceUri: 'mongodb://db1/collection1',
            dataType: 'mongodb'
          },
          {
            mcpServer: 'server2',
            resourceUri: 'mysql://db2/table1',
            dataType: 'mysql'
          }
        ]
      };

      const result = await controller.analyzeRelations(dto);

      expect(result).toEqual(expect.objectContaining({
        status: 'completed',
        analysisId: 'test-correlation-id',
        durationMs: expect.any(Number),
        metrics: {
          sourcesAnalyzed: 2,
          memoryUsed: expect.any(Number)
        }
      }));
      expect(mockRedisService.analyzeCrossSourceRelations).toHaveBeenCalledWith(dto.sources);
    });

    it('should handle analysis errors', async () => {
      const dto: AnalyzeDataRelationsDto = {
        sources: [
          {
            mcpServer: 'server1',
            resourceUri: 'invalid-uri',
            dataType: 'mongodb'
          }
        ]
      };

      (mockRedisService.analyzeCrossSourceRelations as jest.Mock).mockRejectedValueOnce(
        new Error('Invalid resource URI')
      );

      const result = await controller.analyzeRelations(dto);

      expect(result).toEqual({
        status: 'error',
        errorCode: 'RELATION_ANALYSIS_FAILED',
        message: 'Invalid resource URI',
        details: {
          failedSources: dto.sources,
          timestamp: expect.any(String)
        }
      });
    });
  });
}); 