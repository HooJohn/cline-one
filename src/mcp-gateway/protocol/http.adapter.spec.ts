import { HttpAdapter } from './http.adapter';
import { McpServer, McpServerConfig } from '../interfaces/mcp-server.interface';

describe('HttpAdapter', () => {
  let adapter: HttpAdapter;
  const mockPort = 3000;
  const mockBaseEndpoint = 'http://localhost:3000';
  const mockConfig: McpServerConfig = {
    id: 'test-http-config',
    protocol: 'http',
    endpoint: mockBaseEndpoint
  };

  beforeEach(() => {
    adapter = new HttpAdapter(mockPort);
    jest.clearAllMocks();
    (global.fetch as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>).mockClear();
  });

  beforeAll(() => {
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => 
      Promise.resolve(new Response())
    ) as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;
  });

  describe('discover', () => {
    const mockServerInfo = {
      name: 'Test HTTP Server',
      version: '1.0.0',
      capabilities: {
        tools: [{ name: 'tool1' }],
        resources: [],
        resourceTemplates: [],
        includes: (capability: string) => false
      }
    };

    it('should discover an HTTP server successfully', async () => {
      const connectedPromise = new Promise<void>((resolve) => {
        adapter.once('connected', () => resolve());
      });

      (global.fetch as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockServerInfo)
        } as Response)
      );

      const discoveryPromise = adapter.discover(mockConfig);
      
      // 等待所有微任务完成
      await Promise.resolve();
      
      const server = await discoveryPromise;
      await connectedPromise;

      expect(server).toMatchObject({
        id: mockConfig.id,
        name: mockServerInfo.name,
        version: mockServerInfo.version,
        protocol: 'http',
        status: 'connected'
      });
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseEndpoint}/mcp-info`,
        expect.any(Object)
      );
    }, 10000);

    it('should handle non-200 responses and emit error', async () => {
      const errorPromise = new Promise<Error>((resolve) => {
        adapter.once('error', (error) => resolve(error));
      });

      (global.fetch as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>).mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found'
        } as Response)
      );

      const discoveryPromise = adapter.discover(mockConfig);
      
      // 等待所有微任务完成
      await Promise.resolve();
      
      const [error, server] = await Promise.all([
        errorPromise,
        discoveryPromise
      ]);

      expect(server).toBeNull();
      expect(error.message).toContain('HTTP request failed');
      expect(error.message).toContain('404');
    }, 10000);

    it('should handle network errors and emit error', async () => {
      const errorPromise = new Promise<Error>((resolve) => {
        adapter.once('error', (error) => resolve(error));
      });

      const networkError = new Error('Network error');
      (global.fetch as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>).mockImplementationOnce(() =>
        Promise.reject(networkError)
      );

      const discoveryPromise = adapter.discover(mockConfig);
      
      // 等待所有微任务完成
      await Promise.resolve();
      
      const [error, server] = await Promise.all([
        errorPromise,
        discoveryPromise
      ]);

      expect(server).toBeNull();
      expect(error.message).toContain('Network error');
    }, 10000);

    it('should handle JSON parse errors and emit error', async () => {
      const errorPromise = new Promise<Error>((resolve) => {
        adapter.once('error', (error) => resolve(error));
      });

      (global.fetch as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('Invalid JSON'))
        } as Response)
      );

      const discoveryPromise = adapter.discover(mockConfig);
      
      // 等待所有微任务完成
      await Promise.resolve();
      
      const [error, server] = await Promise.all([
        errorPromise,
        discoveryPromise
      ]);

      expect(server).toBeNull();
      expect(error.message).toContain('JSON parse error');
    }, 10000);

    it('should handle invalid server info and emit error', async () => {
      const errorPromise = new Promise<Error>((resolve) => {
        adapter.once('error', (error) => resolve(error));
      });

      const invalidServerInfo = {
        // 缺少必需的字段
        version: '1.0.0'
      };

      (global.fetch as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(invalidServerInfo)
        } as Response)
      );

      const discoveryPromise = adapter.discover(mockConfig);
      
      // 等待所有微任务完成
      await Promise.resolve();
      
      const [error, server] = await Promise.all([
        errorPromise,
        discoveryPromise
      ]);

      expect(server).toBeNull();
      expect(error.message).toContain('Invalid server info');
    }, 10000);
  });

  describe('checkHeartbeat', () => {
    const mockServer: McpServer = {
      id: 'test-server',
      name: 'Test Server',
      version: '1.0.0',
      protocol: 'http',
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

    it('should return true for successful health check', async () => {
      (global.fetch as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'ok' })
        } as Response)
      );

      const result = await adapter.checkHeartbeat(mockServer);
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockBaseEndpoint}/health`,
        expect.any(Object)
      );
    });

    it('should return false for non-200 responses', async () => {
      (global.fetch as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>).mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 500
        } as Response)
      );

      expect(await adapter.checkHeartbeat(mockServer)).toBe(false);
    });

    it('should return false for network errors', async () => {
      (global.fetch as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>).mockImplementationOnce(() =>
        Promise.reject(new Error('Network error'))
      );

      expect(await adapter.checkHeartbeat(mockServer)).toBe(false);
    });

    it('should return false for invalid health check response', async () => {
      (global.fetch as jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'error' })
        } as Response)
      );

      expect(await adapter.checkHeartbeat(mockServer)).toBe(false);
    });
  });
}); 