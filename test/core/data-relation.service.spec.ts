import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../src/core/data-relation.service';
import { LlmAdapterService } from '../../src/llm/llm-adapter.service';
import { createMockRedisService } from '../__mocks__/redis.types';

jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue('test-value'),
    hSet: jest.fn().mockResolvedValue(1),
    hGetAll: jest.fn().mockResolvedValue({ key: 'value' }),
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue(undefined),
    expire: jest.fn().mockResolvedValue(1),
    duplicate: jest.fn().mockReturnThis()
  })
}));

describe('RedisService', () => {
  let service: RedisService;
  let mockLlmAdapter: jest.Mocked<LlmAdapterService>;

  beforeEach(async () => {
    mockLlmAdapter = {
      analyze: jest.fn().mockResolvedValue({
        plan: {
          relations: [
            {
              source1: 'mongodb://db1/collection1',
              source2: 'mysql://db2/table1',
              type: 'foreign-key',
              confidence: 0.9
            }
          ]
        },
        recommendations: [
          'Consider creating an index on the foreign key columns'
        ]
      })
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: LlmAdapterService,
          useValue: mockLlmAdapter
        }
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('basic Redis operations', () => {
    it('should set and get values', async () => {
      await service.set('test-key', 'test-value');
      const value = await service.get('test-key');
      expect(value).toBe('test-value');
    });
    
    it('should set values with TTL', async () => {
      await service.set('test-key', 'test-value', 3600);
      const client = (service as any).client;
      expect(client.expire).toHaveBeenCalledWith('test-key', 3600);
    });
    
  });

  
  it('should handle template loading', async () => {
    const template = service.getTemplate('test-template');
    expect(template).toBe('test-template');
  });
  
  describe('analyzeCrossSourceRelations', () => {
    it('should analyze relations between data sources', async () => {
      const sources = [
        {
          mcpServer: 'server1',
          resourceUri: 'mongodb://db1/collection1',
          dataType: 'mongodb' as const
        },
        {
          mcpServer: 'server2',
          resourceUri: 'mysql://db2/table1',
          dataType: 'mysql' as const
        }
      ];

      
      const result = await service.analyzeCrossSourceRelations(sources);

      expect(result).toEqual(expect.objectContaining({
        correlationId: expect.any(String),
        status: 'completed',
        analysis: expect.any(Object),
        recommendations: expect.any(Array)
      }));

      expect(mockLlmAdapter.analyze).toHaveBeenCalledWith({
        templateType: 'data-relation-analysis',
        variables: {
          analysisPrompt: expect.stringContaining('请分析以下数据源的关联关系')
        }
      });
    });

    it('should throw error when LLM service is unavailable', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [RedisService],
      }).compile();

      const serviceWithoutLlm = module.get<RedisService>(RedisService);
      
      mockLlmAdapter.analyze.mockRejectedValue(new Error('LLM service unavailable'));
      
      await expect(serviceWithoutLlm.analyzeCrossSourceRelations([
        {
          mcpServer: 'server1',
          resourceUri: 'mongodb://db1/collection1',
          dataType: 'mongodb' as const
        }
      ])).rejects.toThrow('LLM service unavailable');
    });
  });
}); 