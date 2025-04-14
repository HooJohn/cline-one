import { Test, TestingModule } from '@nestjs/testing';
import { McpDiscoveryService } from '../../../src/mcp-gateway/discovery/mcp-discovery.service';
import { McpServerConfig, McpServer, ServerStatus } from '../../../src/interfaces/mcp-server.interface';
import { ServerRegistry } from '../../../src/mcp-gateway/discovery/server-registry';
import { McpConfigService } from '../../../src/mcp-gateway/config/mcp-config.service';
import { ProtocolAdapters } from '../../../src/mcp-gateway/protocol/protocol-adapters.type';
import { WebSocketAdapter } from '../../../src/mcp-gateway/protocol/websocket.adapter';
import { HttpAdapter } from '../../../src/mcp-gateway/protocol/http.adapter';
import { SseAdapter } from '../../../src/mcp-gateway/protocol/sse.adapter';
import { MockAdapter, MockServerRegistry, MockConfigService } from '../../__mocks__/types';
import { ProtocolAdapter } from '../../../src/mcp-gateway/protocol/protocol-adapters.type';
describe('McpDiscoveryService', () => {
  let service: McpDiscoveryService;
  let mockAdapter: MockAdapter;
  let mockServerRegistry: MockServerRegistry;
  let mockConfigService: MockConfigService;
  let mockProtocolAdapters: ProtocolAdapters;

  beforeEach(async () => {
    mockAdapter = new MockAdapter();

    // Setup mock ServerRegistry
    const serversMap = new Map<string, McpServer>();
    mockServerRegistry = {
      servers: serversMap,
      register: jest.fn().mockImplementation((server) => {
        serversMap.set(server.id, server);
        return server;
      }),
      getAllServers: jest.fn().mockImplementation(() => Array.from(serversMap.values())),
      getServer: jest.fn().mockImplementation((id) => serversMap.get(id)),
      updateStatus: jest.fn().mockImplementation((id, status) => {
        const server = serversMap.get(id);
        if (server) {
          server.status = status;
          serversMap.set(id, server);
        }
      }),
      clear: jest.fn().mockImplementation(() => serversMap.clear()),
      unregister: jest.fn().mockImplementation((id) => serversMap.delete(id)),
      logError: jest.fn(),
    };

    // Setup mock ConfigService
    mockConfigService = {
      getServerConfigs: jest.fn().mockReturnValue([]),
      getServerById: jest.fn().mockReturnValue(null),
      getHeartbeatInterval: jest.fn().mockReturnValue(30000),
      getServerConfig: jest.fn().mockReturnValue(null),
      loadConfig: jest.fn(),
      setupFileWatch: jest.fn(),
      httpPort: 3000,
    };

    // Setup mock ProtocolAdapters
    mockProtocolAdapters = {
      sse: Object.assign(mockAdapter as unknown as SseAdapter, {
        keepAliveInterval: 15000,
        maxRetries: 3
      }),
      http: mockAdapter as unknown as HttpAdapter,
      stdio: mockAdapter as unknown as ProtocolAdapter,
      ws: Object.assign(mockAdapter as unknown as WebSocketAdapter, {
        handleBinaryMessages: false,
        connectionTimeout: 30000
      })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpDiscoveryService,
        { provide: ServerRegistry, useValue: mockServerRegistry },
        { provide: McpConfigService, useValue: mockConfigService },
        { provide: 'PROTOCOL_ADAPTERS', useValue: mockProtocolAdapters }
      ]
    }).compile();

    service = module.get<McpDiscoveryService>(McpDiscoveryService);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerServer', () => {
    it('should register a new server successfully', async () => {
      const config: McpServerConfig = { 
        id: 'new-server', 
        protocol: 'sse', 
        endpoint: 'http://localhost:3001' 
      };
      
      const server: McpServer = {
        ...config,
        name: `Test Server ${config.id}`,
        version: '2.0.0',
        status: 'connected' as ServerStatus,
        lastSeen: Date.now(),
        lastHeartbeat: Date.now(),
        capabilities: {
          tools: [],
          resources: [],
          resourceTemplates: [],
          includes: () => false
        },
        config: config
      };
      
      const result = await service.registerServer(server);

      expect(result).toEqual(expect.objectContaining({
        id: config.id,
        protocol: config.protocol,
        status: 'connected',
        config: config
      }));
      expect(mockAdapter.discover).toHaveBeenCalledWith(config);
      expect(mockServerRegistry.register).toHaveBeenCalled();
    });

    it('should throw an error when trying to register an existing server', async () => {
      const config: McpServerConfig = { 
        id: 'existing-server', 
        protocol: 'sse', 
        endpoint: 'http://localhost:3002' 
      };
      
      const server: McpServer = {
        ...config,
        name: `Test Server ${config.id}`,
        version: '2.0.0',
        status: 'connected' as ServerStatus,
        lastSeen: Date.now(),
        lastHeartbeat: Date.now(),
        capabilities: {
          tools: [],
          resources: [],
          resourceTemplates: [],
          includes: () => false
        },
        config: config
      };
      
      mockServerRegistry.getServer.mockReturnValueOnce(server);

      await expect(service.registerServer(server)).rejects.toThrow();
    });
  });

  // Add more test suites for other methods...
}); 