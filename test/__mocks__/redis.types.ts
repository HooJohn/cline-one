import { RedisService } from '../../src/core/data-relation.service';
import { LlmAdapterService } from '../../src/llm/llm-adapter.service';

export type MockRedisService = Partial<RedisService> & {
  getClient: jest.Mock;
  client: {
    set: jest.Mock;
    get: jest.Mock;
    hSet: jest.Mock;
    hGetAll: jest.Mock;
    publish: jest.Mock;
    subscribe: jest.Mock;
    connect: jest.Mock;
    expire: jest.Mock;
  };
  llmAdapter?: LlmAdapterService;
};

export const createMockRedisService = (): MockRedisService => ({
  client: {
    set: jest.fn().mockImplementation(async (key: string, value: string, ttl?: number) => {
      await Promise.resolve();
    }),
    get: jest.fn().mockImplementation(async (key: string) => {
      return 'test-value';
    }),
    hSet: jest.fn().mockImplementation(async (key: string, field: string, value: string) => {
      return 1;
    }),
    hGetAll: jest.fn().mockResolvedValue({ key: 'value' }),
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue(undefined),
    expire: jest.fn().mockResolvedValue(1)
  },
  getClient: jest.fn().mockImplementation(() => ({
    hGetAll: jest.fn(),
    hSet: jest.fn(),
    expire: jest.fn()
  })),
  analyzeCrossSourceRelations: jest.fn().mockImplementation(async (sources) => ({
    correlationId: 'test-correlation-id',
    status: 'completed',
    analysis: {
      relations: [{
        source1: sources[0],
        source2: sources[1], 
        type: 'foreign-key',
        confidence: 0.9
      }]
    },
    recommendations: [
      'Consider creating an index on the foreign key columns'
    ]
  }))
});
