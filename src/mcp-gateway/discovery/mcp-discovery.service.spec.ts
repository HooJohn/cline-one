import { Test, TestingModule } from '@nestjs/testing';
import { McpDiscoveryService } from './mcp-discovery.service';
import { McpConfigService } from '../config/mcp-config.service';
import { McpServerConfig, McpServer } from '../interfaces/mcp-server.interface';
import { ServerRegistry } from './server-registry';
import { ProtocolAdapter, ProtocolAdapters } from '../protocol/protocol-adapters.type';
import { WebSocketAdapter } from '../protocol/websocket.adapter';
import { HttpAdapter } from '../protocol/http.adapter';
import { SseAdapter } from '../protocol/sse.adapter';
import { EventEmitter } from 'events';
import { LoggerService, LogLevel } from '@nestjs/common'; // Import LogLevel if needed

// Define a minimal Logger mock type (used internally for testing if needed, but not directly assigned to mockServerRegistry)
type MockLogger = {
  log: jest.Mock<any, [message: any, context?: string]>;
  error: jest.Mock<any, [message: any, trace?: string, context?: string]>;
  warn: jest.Mock<any, [message: any, context?: string]>;
  debug: jest.Mock<any, [message: any, context?: string]>;
  verbose: jest.Mock<any, [message: any, context?: string]>;
  fatal: jest.Mock<any, [message: any, trace?: string, context?: string]>;
  setLogLevels?: jest.Mock<any, [levels: LogLevel[]]>;
  setContext?: jest.Mock<any, [context: string]>;
};

// Define a type for the mocked ServerRegistry, focusing on its public interface
type MockServerRegistry = Partial<ServerRegistry> & {
  servers: Map<string, McpServer>; // Keep for internal state simulation
  // Explicitly define *public* methods intended for Jest mocking as jest.Mock
  getServer: jest.Mock<McpServer | undefined, [string]>;
  getAllServers: jest.Mock<McpServer[], []>;
  register: jest.Mock<McpServer, [McpServer]>;
  updateStatus: jest.Mock<void, [string, McpServer['status']]>;
  clear: jest.Mock<void, []>;
  unregister: jest.Mock<boolean, [string]>;
  // Add the expected *public* method for logging errors
  logError: jest.Mock<void, [message: string, error?: any]>;
  // Add any other *public* methods of ServerRegistry used by McpDiscoveryService
};

// Define a type for the mocked McpConfigService
type MockConfigService = Partial<McpConfigService> & {
    getServerConfigs: jest.Mock<McpServerConfig[], []>;
    getHeartbeatInterval: jest.Mock<number, []>;
    getServerConfig: jest.Mock<McpServerConfig | null, [string]>;
    getServerById: jest.Mock<McpServerConfig | null, [string]>;
    loadConfig: jest.Mock<void, []>;
    setupFileWatch: jest.Mock<void, []>;
    // Add other properties/methods if they exist and are used
    httpPort?: number;
};

// Define MockAdapter within the describe block or import if shared
class MockAdapter extends EventEmitter implements ProtocolAdapter {
  protocol = 'sse' as const; // Default, can be overridden

  discover = jest.fn().mockImplementation(async (config: McpServerConfig): Promise<McpServer> => {
    // Basic mock discover implementation
    return {
      id: config.id,
      name: `Test Server ${config.id}`,
      version: '2.0.0', // Default compatible version
      status: 'connected',
      protocol: config.protocol,
      lastSeen: new Date(),
      lastHeartbeat: Date.now(),
      config: config,
      capabilities: {
        tools: [],
        resources: [],
        resourceTemplates: [],
        includes: (capability: string) => false
      }
    };
  });

  checkHeartbeat = jest.fn().mockResolvedValue(true); // Default healthy heartbeat
}


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
      servers: serversMap, // Simulate internal state
      // Mock public methods
      register: jest.fn().mockImplementation((server: McpServer) => {
        serversMap.set(server.id, server);
        return server;
      }),
      getAllServers: jest.fn().mockImplementation(() => Array.from(serversMap.values())),
      getServer: jest.fn().mockImplementation((id: string) => serversMap.get(id)),
      updateStatus: jest.fn().mockImplementation((id: string, status: McpServer['status']) => {
        const server = serversMap.get(id);
        if (server) {
          server.status = status;
          serversMap.set(id, server); // Ensure map is updated if needed elsewhere
        }
      }),
      clear: jest.fn().mockImplementation(() => serversMap.clear()),
      unregister: jest.fn().mockImplementation((id: string) => serversMap.delete(id)),
      logError: jest.fn(), // <-- Mock the public logError method
      // NOTE: Do NOT mock 'logger' directly here as it's private
    };

    // Setup mock ConfigService
    mockConfigService = {
      getServerConfigs: jest.fn().mockReturnValue([]),
      getServerById: jest.fn().mockReturnValue(null),
      getHeartbeatInterval: jest.fn().mockReturnValue(30000), // Default interval
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
      stdio: mockAdapter,
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
    jest.clearAllMocks(); // Reset mocks
    jest.clearAllTimers(); // Clear any pending timers
    jest.useRealTimers(); // Restore real timers
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // --- Registration Tests (registerServer method) ---

  it('should register a new server successfully via registerServer()', async () => {
    const config: McpServerConfig = { id: 'new-server', protocol: 'sse', endpoint: 'http://localhost:3001' };
    const expectedServer: McpServer = {
        id: config.id, 
        name: `Test Server ${config.id}`, 
        version: '2.0.0', 
        status: 'connected',
        protocol: config.protocol, 
        lastSeen: expect.any(Date), 
        lastHeartbeat: Date.now(),
        config: config,
        capabilities: { tools: [], resources: [], resourceTemplates: [], includes: (capability: string) => false }
    };
    mockAdapter.discover.mockResolvedValueOnce(expectedServer);
    mockServerRegistry.getServer.mockReturnValueOnce(undefined); // Simulate server doesn't exist yet

    const result = await service.registerServer(config);

    expect(result).toEqual(expectedServer);
    expect(mockAdapter.discover).toHaveBeenCalledWith(config);
    // registerServer calls discover first, then checks existence, then registers
    expect(mockServerRegistry.getServer).toHaveBeenCalledWith(config.id);
    expect(mockServerRegistry.register).toHaveBeenCalledWith(expectedServer);
  });

  it('should throw an error when trying to register an existing server via registerServer()', async () => {
    const config: McpServerConfig = { id: 'existing-server', protocol: 'sse', endpoint: 'http://localhost:3002' };
    const existingServer: McpServer = {
        id: config.id, 
        name: `Test Server ${config.id}`, 
        version: '2.0.0', 
        status: 'connected',
        protocol: config.protocol, 
        lastSeen: new Date(), 
        lastHeartbeat: Date.now(),
        config: config,
        capabilities: { tools: [], resources: [], resourceTemplates: [], includes: (capability: string) => false }
     };
    mockAdapter.discover.mockResolvedValueOnce(existingServer); // Discover succeeds
    mockServerRegistry.getServer.mockReturnValueOnce(existingServer); // Simulate server *does* exist

    await expect(service.registerServer(config)).rejects.toThrow('服务器已存在'); // Or the exact error message from your source
    expect(mockAdapter.discover).toHaveBeenCalledWith(config);
    expect(mockServerRegistry.getServer).toHaveBeenCalledWith(config.id);
    expect(mockServerRegistry.register).not.toHaveBeenCalled(); // Should not register again
  });

  it('should handle adapter discovery failure during registerServer()', async () => {
    const config: McpServerConfig = { id: 'fail-server', protocol: 'sse', endpoint: 'http://localhost:3003' };
    const discoveryError = new Error('Adapter connection refused');
    mockAdapter.discover.mockRejectedValueOnce(discoveryError);
    // getServer might not be called if discover fails first, depending on implementation order.
    // Assuming discover happens before getServer check in registerServer:
    mockServerRegistry.getServer.mockReturnValueOnce(undefined); // Setup needed if check happens before discover

    await expect(service.registerServer(config)).rejects.toThrow(discoveryError);
    expect(mockAdapter.discover).toHaveBeenCalledWith(config);
    // Depending on source code's try/catch block, these might not be called:
    // expect(mockServerRegistry.getServer).not.toHaveBeenCalled();
    expect(mockServerRegistry.register).not.toHaveBeenCalled();
  });

  it('should throw TypeError if protocol adapter is missing during registerServer()', async () => {
      const config: McpServerConfig = { id: 'no-adapter-server', protocol: 'invalid' as any, endpoint: 'uri' };
      // No need to mock discover as adapter lookup should fail first
      // mockServerRegistry.getServer.mockReturnValueOnce(undefined); // Assume check happens after adapter lookup

      // Depending on how missing adapters are handled (e.g., direct access `this.adapters[config.protocol]`),
      // it might throw a TypeError accessing a property on undefined.
      await expect(service.registerServer(config)).rejects.toThrow(TypeError); // Or a more specific error if thrown explicitly
      expect(mockAdapter.discover).not.toHaveBeenCalled();
      expect(mockServerRegistry.getServer).not.toHaveBeenCalled();
      expect(mockServerRegistry.register).not.toHaveBeenCalled();
  });


  // --- Initial Discovery (discoverServers method) Tests ---

  it('should discover and register servers from config via discoverServers()', async () => {
    const configs: McpServerConfig[] = [
      { id: 'config-1', protocol: 'sse', endpoint: 'ep1' },
      { id: 'config-2', protocol: 'http', endpoint: 'ep2' }
    ];
    const server1: McpServer = { id: 'config-1', name: 'S1', version: '2.0.0', protocol: 'sse' } as McpServer;
    const server2: McpServer = { id: 'config-2', name: 'S2', version: '2.1.0', protocol: 'http' } as McpServer;

    mockConfigService.getServerConfigs.mockReturnValue(configs);
    // Setup discover mock for each config
    mockAdapter.discover.mockResolvedValueOnce(server1); // For configs[0]
    mockAdapter.discover.mockResolvedValueOnce(server2); // For configs[1]
    // Assume registry is empty initially if needed by register logic
    // mockServerRegistry.getServer.mockReturnValue(undefined); // If register checks existence

    await service.discoverServers();

    expect(mockConfigService.getServerConfigs).toHaveBeenCalledTimes(1);
    expect(mockAdapter.discover).toHaveBeenCalledTimes(2);
    expect(mockAdapter.discover).toHaveBeenCalledWith(configs[0]);
    expect(mockAdapter.discover).toHaveBeenCalledWith(configs[1]);
    expect(mockServerRegistry.register).toHaveBeenCalledTimes(2);
    expect(mockServerRegistry.register).toHaveBeenCalledWith(server1);
    expect(mockServerRegistry.register).toHaveBeenCalledWith(server2);
    expect(mockServerRegistry.logError).not.toHaveBeenCalled(); // No errors expected
  });

  it('should log error if discovery fails during discoverServers()', async () => {
    const configs: McpServerConfig[] = [
      { id: 'ok-cfg', protocol: 'sse', endpoint: 'ep1' },
      { id: 'fail-cfg', protocol: 'http', endpoint: 'ep2' }
    ];
    const serverOk: McpServer = { id: 'ok-cfg', name: 'OK', version: '2.0.0', protocol: 'sse' } as McpServer;
    const discoveryError = new Error('HTTP adapter failed');

    mockConfigService.getServerConfigs.mockReturnValue(configs);
    mockAdapter.discover.mockResolvedValueOnce(serverOk).mockRejectedValueOnce(discoveryError);
    // mockServerRegistry.getServer.mockReturnValue(undefined); // If register checks existence

    await service.discoverServers();

    expect(mockAdapter.discover).toHaveBeenCalledTimes(2);
    expect(mockServerRegistry.register).toHaveBeenCalledTimes(1);
    expect(mockServerRegistry.register).toHaveBeenCalledWith(serverOk);

    // *** Check that logError on the registry mock was called ***
    expect(mockServerRegistry.logError).toHaveBeenCalledTimes(1);
    expect(mockServerRegistry.logError).toHaveBeenCalledWith(
        expect.stringContaining(`Discovery failed for ${configs[1].id}`), // Check the message part
        discoveryError // Check the error object itself was passed
    );
  });

  // --- Heartbeat Interval (startHeartbeatCheck method) Tests ---

  // Note: Testing setInterval directly is tricky. We test the *effect* using fake timers.
  it('should attempt periodic heartbeat checks for registered servers', async () => {
    const interval = 10000;
    const server1: McpServer = { id: 'hb-server-1', protocol: 'sse', status: 'connected', version: '2.0.0' } as McpServer;
    const server2: McpServer = { id: 'hb-server-2', protocol: 'http', status: 'connected', version: '2.0.0' } as McpServer;

    // Setup registry with servers
    mockServerRegistry.getAllServers.mockReturnValue([server1, server2]);
    mockAdapter.checkHeartbeat.mockResolvedValue(true); // Assume both are healthy initially

    service.startHeartbeatCheck(interval);

    // Advance time past the first interval
    jest.advanceTimersByTime(interval + 1);
    // Wait for async operations within the interval callback to complete
    await Promise.resolve(); await Promise.resolve(); // Flush promise queue

    expect(mockServerRegistry.getAllServers).toHaveBeenCalled();
    expect(mockAdapter.checkHeartbeat).toHaveBeenCalledTimes(2); // Called for each server
    expect(mockAdapter.checkHeartbeat).toHaveBeenCalledWith(server1);
    expect(mockAdapter.checkHeartbeat).toHaveBeenCalledWith(server2);
    expect(mockServerRegistry.updateStatus).toHaveBeenCalledTimes(2);
    expect(mockServerRegistry.updateStatus).toHaveBeenCalledWith(server1.id, 'healthy');
    expect(mockServerRegistry.updateStatus).toHaveBeenCalledWith(server2.id, 'healthy');

    // Advance time for another interval
    jest.advanceTimersByTime(interval);
    await Promise.resolve(); await Promise.resolve(); // Flush promise queue

    expect(mockAdapter.checkHeartbeat).toHaveBeenCalledTimes(4); // Called again for each server
    expect(mockServerRegistry.updateStatus).toHaveBeenCalledTimes(4); // Called again for each server
  });

  it('should update status to unhealthy on failed periodic heartbeat check', async () => {
    const serverId = 'unhealthy-server';
    const server: McpServer = { id: serverId, protocol: 'http', status: 'healthy', version: '2.0.0' } as McpServer;
    mockServerRegistry.getAllServers.mockReturnValue([server]);
    mockAdapter.checkHeartbeat.mockResolvedValueOnce(false); // Simulate failed check

    service.startHeartbeatCheck(5000);
    jest.advanceTimersByTime(5001);
    await Promise.resolve(); await Promise.resolve();

    expect(mockAdapter.checkHeartbeat).toHaveBeenCalledWith(server);
    expect(mockServerRegistry.updateStatus).toHaveBeenCalledWith(serverId, 'unhealthy');
  });

   it('should update status to unhealthy on error during periodic heartbeat check', async () => {
    const serverId = 'error-server';
    const server: McpServer = { id: serverId, protocol: 'sse', status: 'healthy', version: '2.0.0' } as McpServer;
    mockServerRegistry.getAllServers.mockReturnValue([server]);
    mockAdapter.checkHeartbeat.mockRejectedValueOnce(new Error('Network timeout')); // Simulate error

    service.startHeartbeatCheck(5000);
    jest.advanceTimersByTime(5001);
    await Promise.resolve(); await Promise.resolve();

    expect(mockAdapter.checkHeartbeat).toHaveBeenCalledWith(server);
    expect(mockServerRegistry.updateStatus).toHaveBeenCalledWith(serverId, 'unhealthy');
  });

  // --- Direct Heartbeat Check (checkHeartbeat method) Tests ---

  it('should check heartbeat for a specific server successfully via checkHeartbeat()', async () => {
    const serverId = 'direct-ok';
    const server: McpServer = { id: serverId, protocol: 'sse', status: 'unknown', version: '2.0.0' } as McpServer;
    mockServerRegistry.getServer.mockReturnValueOnce(server);
    mockAdapter.checkHeartbeat.mockResolvedValueOnce(true); // Simulate success

    const isAlive = await service.checkHeartbeat(serverId);

    expect(isAlive).toBe(true);
    expect(mockServerRegistry.getServer).toHaveBeenCalledWith(serverId);
    expect(mockAdapter.checkHeartbeat).toHaveBeenCalledWith(server);
    expect(mockServerRegistry.updateStatus).toHaveBeenCalledWith(serverId, 'connected'); // Note: source uses 'connected' here
  });

  it('should handle failed direct heartbeat check via checkHeartbeat()', async () => {
    const serverId = 'direct-fail';
    const server: McpServer = { id: serverId, protocol: 'sse', status: 'connected', version: '2.0.0' } as McpServer;
    mockServerRegistry.getServer.mockReturnValueOnce(server);
    mockAdapter.checkHeartbeat.mockResolvedValueOnce(false); // Simulate failure

    const isAlive = await service.checkHeartbeat(serverId);

    expect(isAlive).toBe(false);
    expect(mockServerRegistry.getServer).toHaveBeenCalledWith(serverId);
    expect(mockAdapter.checkHeartbeat).toHaveBeenCalledWith(server);
    expect(mockServerRegistry.updateStatus).toHaveBeenCalledWith(serverId, 'unhealthy');
  });

  it('should handle error during direct heartbeat check via checkHeartbeat()', async () => {
    const serverId = 'direct-error';
    const server: McpServer = { id: serverId, protocol: 'sse', status: 'connected', version: '2.0.0' } as McpServer;
    const checkError = new Error('Network error');
    mockServerRegistry.getServer.mockReturnValueOnce(server);
    mockAdapter.checkHeartbeat.mockRejectedValueOnce(checkError); // Simulate error

    const isAlive = await service.checkHeartbeat(serverId);

    expect(isAlive).toBe(false);
    expect(mockServerRegistry.getServer).toHaveBeenCalledWith(serverId);
    expect(mockAdapter.checkHeartbeat).toHaveBeenCalledWith(server);
    expect(mockServerRegistry.updateStatus).toHaveBeenCalledWith(serverId, 'unhealthy');
  });

  it('should throw error if server not found during direct heartbeat check via checkHeartbeat()', async () => {
    const serverId = 'non-existent';
    mockServerRegistry.getServer.mockReturnValueOnce(undefined); // Simulate not found

    await expect(service.checkHeartbeat(serverId)).rejects.toThrow(`Server ${serverId} not found`);
    expect(mockServerRegistry.getServer).toHaveBeenCalledWith(serverId);
    expect(mockAdapter.checkHeartbeat).not.toHaveBeenCalled();
    expect(mockServerRegistry.updateStatus).not.toHaveBeenCalled();
  });

  it('should handle missing protocol adapter during direct heartbeat check via checkHeartbeat()', async () => {
      const serverId = 'bad-protocol-server';
      const server: McpServer = { id: serverId, protocol: 'invalid' as any, status: 'connected', version: '2.0.0' } as McpServer;
      mockServerRegistry.getServer.mockReturnValueOnce(server);
      // No need to mock checkHeartbeat as adapter lookup fails

      // Assumes direct property access like `this.adapters[server.protocol]` will throw TypeError
      // Or potentially return false and update status if handled gracefully in source
      // Based on source code, it seems like it would try access, fail, and go to catch block.
      const isAlive = await service.checkHeartbeat(serverId);

      expect(isAlive).toBe(false); // Because the catch block returns false
      expect(mockServerRegistry.getServer).toHaveBeenCalledWith(serverId);
      expect(mockAdapter.checkHeartbeat).not.toHaveBeenCalled(); // Adapter access failed
      expect(mockServerRegistry.updateStatus).toHaveBeenCalledWith(serverId, 'unhealthy'); // Called in catch block
  });


  // --- Compatibility Check (verifyCompatibility method) ---

  it('should verify server compatibility correctly (version >= 2.0.0)', () => {
    // Cast to McpServer to satisfy type checking, only 'version' is used by the method
    const compatibleServer: McpServer = { version: '2.0.0' } as McpServer;
    const higherCompatibleServer: McpServer = { version: '2.1.5' } as McpServer;
    const futureCompatibleServer: McpServer = { version: '3.0.0' } as McpServer;
    const incompatibleServer: McpServer = { version: '1.9.9' } as McpServer;
    const incompatibleServerMinor: McpServer = { version: '0.5.0' } as McpServer;
    const incompatibleServerEdge: McpServer = { version: '1.99.99' } as McpServer; // Edge case

    // Directly call the method on the service instance
    expect(service.verifyCompatibility(compatibleServer)).toBe(true);
    expect(service.verifyCompatibility(higherCompatibleServer)).toBe(true);
    expect(service.verifyCompatibility(futureCompatibleServer)).toBe(true);
    expect(service.verifyCompatibility(incompatibleServer)).toBe(false);
    expect(service.verifyCompatibility(incompatibleServerMinor)).toBe(false);
    expect(service.verifyCompatibility(incompatibleServerEdge)).toBe(false);
  });

  // --- Optional: Test startHeartbeatCheck uses config interval if no interval is passed ---
  it('should use heartbeat interval from config service when none is provided to startHeartbeatCheck', () => {
    const configInterval = 30000; // Must match mockConfigService.getHeartbeatInterval mock value
    mockConfigService.getHeartbeatInterval.mockReturnValue(configInterval); // Setup mock config value
    // We spy on setInterval to check the interval argument without actually running timers here
    const setIntervalSpy = jest.spyOn(global, 'setInterval');

    service.startHeartbeatCheck(); // Call without argument

    // Check that setInterval was called with the interval from the config service
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), configInterval); // Check interval value

    setIntervalSpy.mockRestore(); // Clean up the spy
 });

});
