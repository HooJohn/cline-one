import { Test, TestingModule } from '@nestjs/testing';
import { LlmAdapterService } from '@llm/llm-adapter.service';
import { MockLlmProvider, createMockLlmProvider } from '../__mocks__/llm.types';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

describe('LlmAdapterService', () => {
  let service: LlmAdapterService;
  let mockProvider: MockLlmProvider;
  let mockConfigService: Partial<ConfigService>;
  
  beforeEach(async () => {
    mockProvider = createMockLlmProvider();
    mockConfigService = {
      get: jest.fn().mockReturnValue('src/config/prompt-templates.yaml'),
      getOrThrow: jest.fn(),
      set: jest.fn(),
      setEnvFilePaths: jest.fn(),
      changes$: new Observable()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmAdapterService,
        {
          provide: 'LLM_PROVIDER',
          useValue: mockProvider
        },
        {
          provide: ConfigService,
          useValue: mockConfigService
        }
      ],
    }).compile();

    service = module.get<LlmAdapterService>(LlmAdapterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCompletion', () => {
    it('should generate response with proper formatting', async () => {
      const testPrompt = 'Test prompt';
      mockProvider.generateResponse.mockResolvedValue({
        content: 'Test response',
        tokensUsed: 42
      });
      
      const response = await service.generateCompletion(testPrompt);
      
      expect(response).toEqual({
        content: 'Test response',
        tokensUsed: 42
      });
      expect(mockProvider.generateResponse).toHaveBeenCalledWith(testPrompt);
      expect(mockProvider.generateResponse).toHaveBeenCalledTimes(1);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost accurately', () => {
      const testUsage = { inputTokens: 1000, outputTokens: 500 };
      mockProvider.calculateCost.mockReturnValue(0.35);
      
      const cost = service.calculateCost(testUsage);
      
      expect(cost).toBe(0.35);
      expect(mockProvider.calculateCost).toHaveBeenCalledWith(testUsage);
      expect(mockProvider.calculateCost).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentModelInfo', () => {
    it('should get current model info', () => {
      const expectedModelInfo = {
        provider: 'Deepseek',
        model: 'deepseek-chat'
      };
      mockProvider.getModelInfo.mockReturnValue(expectedModelInfo);
      
      const modelInfo = service.getCurrentModelInfo();
      
      expect(modelInfo).toEqual(expectedModelInfo);
      expect(mockProvider.getModelInfo).toHaveBeenCalledTimes(1);
    });
  });
}); 