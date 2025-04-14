import { LlmProvider } from '../../src/interfaces/llm-provider.interface';

export type MockLlmProvider = Partial<LlmProvider> & {
  generateResponse: jest.Mock;
  calculateCost: jest.Mock;
  getModelInfo: jest.Mock;
  optimizePlan: jest.Mock;
};

export const createMockLlmProvider = (): MockLlmProvider => ({
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
}); 