import { SseAdapter } from './sse.adapter';
import type { SseAdapterConfig } from './protocol-adapters.type';
import type { McpServer } from '../interfaces/mcp-server.interface';

type MockEventSource = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close: jest.Mock<void, []>;
  addEventListener: jest.Mock<void, [string, EventListenerOrEventListenerObject | null, (boolean | AddEventListenerOptions)?]>;
  removeEventListener: jest.Mock<void, [string, EventListenerOrEventListenerObject | null, (boolean | EventListenerOptions)?]>;
  dispatchEvent: jest.Mock<boolean, [Event]>;
};

let mockEventSourceInstance: MockEventSource;

global.EventSource = jest.fn().mockImplementation(() => {
  mockEventSourceInstance = {
    onmessage: null,
    onerror: null,
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  };
  return mockEventSourceInstance;
}) as any;

global.fetch = jest.fn();

describe('SseAdapter', () => {
  let adapter: SseAdapter;
  const mockBaseEndpoint = 'http://localhost:3000';
  const mockConfig: SseAdapterConfig = {
    id: 'test-sse-config',
    protocol: 'sse',
    endpoint: mockBaseEndpoint,
    keepAliveInterval: 15000,
    maxRetries: 3
  };
  const discoveryUrl = `${mockBaseEndpoint}/mcp-events`;
  const healthUrl = `${mockBaseEndpoint}/health`;

  beforeEach(() => {
    adapter = new SseAdapter();
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('discover', () => {
    jest.setTimeout(15000);

    const simulateEventSourceActivity = async (action: () => void) => {
      return new Promise<void>((resolve) => {
        action();
        // 等待所有微任务完成
        process.nextTick(() => {
          process.nextTick(resolve);
        });
      });
    };

    it('should discover an SSE server successfully via handshake event', async () => {
      const expectedServerInfo = {
        name: 'Test SSE Server',
        version: '1.0.0',
        capabilities: { tools: [{name: 'tool1'}], resources: [], resourceTemplates: [] }
      };
      const handshakeEvent = new MessageEvent('message', {
        data: JSON.stringify(expectedServerInfo)
      });

      const connectedPromise = new Promise<void>((resolve) => {
        adapter.once('connected', () => resolve());
      });

      const discoveryPromise = adapter.discover(mockConfig);
      await simulateEventSourceActivity(() => mockEventSourceInstance.onmessage!(handshakeEvent));
      
      await connectedPromise;
      const server = await discoveryPromise;

      expect(server).toMatchObject({
        id: mockConfig.id,
        name: expectedServerInfo.name,
        version: expectedServerInfo.version,
        protocol: 'sse',
        status: 'connected'
      });
      expect(global.EventSource).toHaveBeenCalledWith(discoveryUrl);
    });

    it('should resolve null and emit error if EventSource connection fails', async () => {
      const errorPromise = new Promise<Error>((resolve) => {
        adapter.once('error', (error) => resolve(error));
      });

      const mockError = new Event('error');
      const discoveryPromise = adapter.discover(mockConfig);
      await simulateEventSourceActivity(() => mockEventSourceInstance.onerror!(mockError));
      
      const [error, server] = await Promise.all([errorPromise, discoveryPromise]);

      expect(server).toBeNull();
      expect(error.message).toContain('SSE connection failed');
      expect(mockEventSourceInstance.close).toHaveBeenCalled();
    });

    it('should handle JSON parse errors and resolve null', async () => {
      const errorPromise = new Promise<Error>((resolve) => {
        adapter.once('error', (error) => resolve(error));
      });

      const invalidEvent = new MessageEvent('message', { data: '{invalid json' });
      const discoveryPromise = adapter.discover(mockConfig);
      await simulateEventSourceActivity(() => mockEventSourceInstance.onmessage!(invalidEvent));
      
      const [error, server] = await Promise.all([errorPromise, discoveryPromise]);

      expect(server).toBeNull();
      expect(error.message).toContain('JSON parse error');
    });
  });

  describe('checkHeartbeat', () => {
    const mockServer: McpServer = {
      id: 'test-server',
      name: 'Test Server',
      version: '1.0.0',
      protocol: 'sse',
      status: 'connected',
      lastSeen: new Date(),
      lastHeartbeat: Date.now(),
      config: mockConfig,
      capabilities: { 
        tools: [], 
        resources: [], 
        resourceTemplates: [],
        includes: (capability: string) => false
      }
    };

    it('should return true for successful 2xx responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
      expect(await adapter.checkHeartbeat(mockServer)).toBe(true);
    });

    it('should return false for non-2xx responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
      expect(await adapter.checkHeartbeat(mockServer)).toBe(false);
    });

    it('should return false for network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      expect(await adapter.checkHeartbeat(mockServer)).toBe(false);
    });
  });
});
