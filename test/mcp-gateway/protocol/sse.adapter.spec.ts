import axios from "axios";
jest.mock("axios");
import { Test, TestingModule } from '@nestjs/testing';
import { SseAdapter } from '../../../src/mcp-gateway/protocol/sse.adapter';
import { createMockConfig, createMockServer } from '../../__mocks__/mcp.types';
import { McpServerConfig } from '../../../src/interfaces/mcp-server.interface';
import { EventSource } from 'eventsource';

jest.mock('eventsource');

describe('SseAdapter', () => {
  let adapter: SseAdapter;
  let mockConfig: McpServerConfig;
  let mockEventSource: jest.Mocked<EventSource>;

  beforeEach(async () => {
    mockEventSource = {
      onmessage: null,
      onerror: null,
      close: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      CONNECTING: 0,
      OPEN: 1,
      CLOSED: 2,
      readyState: 1,
      url: ''
    } as unknown as jest.Mocked<EventSource>;

    (EventSource as unknown as jest.Mock).mockImplementation(() => mockEventSource);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SseAdapter,
          useFactory: () => new SseAdapter()
        }
      ],
    }).compile();

    adapter = module.get<SseAdapter>(SseAdapter);
    mockConfig = {
      id: 'test-server-config',
      endpoint: 'http://localhost:3000',
      protocol: 'sse'
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockEventSource.close();
  });

  describe('discover', () => {
    it('should discover server capabilities', async () => {
      const expectedServer = createMockServer(mockConfig);
      
      // 立即触发消息事件
      setTimeout(() => {
        if (mockEventSource.onmessage) {
          mockEventSource.onmessage({
            data: JSON.stringify({
              id: mockConfig.id,
              name: expectedServer.name,
              version: expectedServer.version,
              capabilities: expectedServer.capabilities
            })
          } as MessageEvent);
        }
      }, 0);
      
      const result = await adapter.discover(mockConfig);
      
      expect(result).toBeDefined();
      expect(result?.id).toBe(mockConfig.id);
      expect(result?.protocol).toBe('sse');
      expect(result?.status).toBe('connected');
    }, 10000);

    it('should handle discovery errors', async () => {
      // 立即触发错误事件
      setTimeout(() => {
        if (mockEventSource.onerror) {
          mockEventSource.onerror({
            type: 'error',
            error: new Error('Connection failed'),
            message: 'Connection failed'
          } as ErrorEvent);
        }
      }, 0);
      
      await expect(adapter.discover(mockConfig))
        .rejects.toThrow('Connection failed');
    }, 10000);
  });

  describe('checkHeartbeat', () => {
    it('should check server heartbeat', async () => {
      const server = createMockServer(mockConfig);
      
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true
      });
      
      const result = await adapter.checkHeartbeat(server);
      
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(`${mockConfig.endpoint}/health`);
    }, 10000);

    it('should handle heartbeat errors', async () => {
      const server = createMockServer({
        ...mockConfig,
        endpoint: 'invalid-endpoint'
      });
      
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));
      
      const result = await adapter.checkHeartbeat(server);
      
      expect(result).toBe(false);
    }, 10000);
  });

  describe('event handling', () => {
    it('should emit connected event', async () => {
      let eventEmitted = false;
      
      adapter.on('connected', () => {
        eventEmitted = true;
      });
      
      // 立即触发消息事件
      setTimeout(() => {
        if (mockEventSource.onmessage) {
          mockEventSource.onmessage({
            data: JSON.stringify({
              name: 'Test Server',
              version: '1.0.0',
              capabilities: {
                tools: [],
                resources: [],
                resourceTemplates: []
              }
            })
          } as MessageEvent);
        }
      }, 0);
      
      await adapter.discover(mockConfig);
      expect(eventEmitted).toBe(true);
    }, 10000);

    it('should emit error event', async () => {
      let eventEmitted = false;
      
      adapter.on('error', () => {
        eventEmitted = true;
      });
      
      // 立即触发错误事件
      setTimeout(() => {
        if (mockEventSource.onerror) {
          mockEventSource.onerror({
            type: 'error',
            error: new Error('Connection failed'),
            message: 'Connection failed'
          } as ErrorEvent);
        }
      }, 0);
      
      try {
        await adapter.discover(mockConfig);
      } catch (error) {
        // 忽略错误
      }
      
      expect(eventEmitted).toBe(true);
    }, 10000);
  });
});
