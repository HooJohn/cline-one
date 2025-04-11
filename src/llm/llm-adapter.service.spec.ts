import { Test, TestingModule } from '@nestjs/testing';
import { LlmAdapterService } from './llm-adapter.service';
import { LlmProvider } from '../interfaces/llm-provider.interface';

describe('LlmAdapterService', () => {
  let service: LlmAdapterService;
  
  const mockProvider: LlmProvider = {
    generateResponse: jest.fn().mockResolvedValue({
      content: 'Test response',
      tokensUsed: 42
    }),
    calculateCost: jest.fn().mockReturnValue(0.35),
    getModelInfo: jest.fn().mockReturnValue({
      provider: 'Deepseek',
      model: 'deepseek-chat'
    }),
    optimizePlan: jest.fn().mockImplementation((plan) => ({
      ...plan,
      optimized: true
    }))
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmAdapterService,
        {
          provide: 'LLM_PROVIDER',
          useValue: mockProvider
        }
      ],
    }).compile();

    service = module.get<LlmAdapterService>(LlmAdapterService);
  });

  it('should generate response with proper formatting', async () => {
    (mockProvider.generateResponse as jest.Mock).mockResolvedValue({
      content: 'Test response',
      tokensUsed: 42
    });
    
    const response = await service.generateCompletion('Test prompt');
    expect(response).toEqual({
      content: 'Test response',
      tokensUsed: 42
    });
    expect(mockProvider.generateResponse).toHaveBeenCalledWith('Test prompt');
  });

  it('should calculate cost accurately', () => {
    const testUsage = { inputTokens: 1000, outputTokens: 500 };
    (mockProvider.calculateCost as jest.Mock).mockReturnValue(0.35);
    
    const cost = service.calculateCost(testUsage);
    expect(cost).toBe(0.35);
    expect(mockProvider.calculateCost).toHaveBeenCalledWith(testUsage);
  });

  it('should get current model info', () => {
    const mockModelInfo = {
      provider: 'Deepseek',
      model: 'deepseek-chat'
    };
    (mockProvider.getModelInfo as jest.Mock).mockReturnValue(mockModelInfo);
    
    const modelInfo = service.getCurrentModelInfo();
    expect(modelInfo).toEqual(mockModelInfo);
    expect(mockProvider.getModelInfo).toHaveBeenCalled();
  });
});
