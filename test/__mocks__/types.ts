import { LogLevel } from '@nestjs/common';
import { McpServer, McpServerConfig } from '../../src/interfaces/mcp-server.interface';
import { ServerRegistry } from '../../src/mcp-gateway/discovery/server-registry';
import { McpConfigService } from '../../src/mcp-gateway/config/mcp-config.service';
import { ProtocolAdapter } from '../../src/mcp-gateway/protocol/protocol-adapters.type';
import { EventEmitter } from 'events';
import { WorkflowTaskDto } from '../../src/orchestration/dto/workflow-task.dto';

export type MockLogger = {
  log: jest.Mock<any, [message: any, context?: string]>;
  error: jest.Mock<any, [message: any, trace?: string, context?: string]>;
  warn: jest.Mock<any, [message: any, context?: string]>;
  debug: jest.Mock<any, [message: any, context?: string]>;
  verbose: jest.Mock<any, [message: any, context?: string]>;
  fatal: jest.Mock<any, [message: any, trace?: string, context?: string]>;
  setLogLevels?: jest.Mock<any, [levels: LogLevel[]]>;
  setContext?: jest.Mock<any, [context: string]>;
};

export type MockServerRegistry = Partial<ServerRegistry> & {
  servers: Map<string, McpServer>;
  getServer: jest.Mock<McpServer | undefined, [string]>;
  getAllServers: jest.Mock<McpServer[], []>;
  register: jest.Mock<McpServer, [McpServer]>;
  updateStatus: jest.Mock<void, [string, McpServer['status']]>;
  clear: jest.Mock<void, []>;
  unregister: jest.Mock<boolean, [string]>;
  logError: jest.Mock<void, [message: string, error?: any]>;
};

export type MockConfigService = Partial<McpConfigService> & {
  getServerConfigs: jest.Mock<McpServerConfig[], []>;
  getHeartbeatInterval: jest.Mock<number, []>;
  getServerConfig: jest.Mock<McpServerConfig | null, [string]>;
  getServerById: jest.Mock<McpServerConfig | null, [string]>;
  loadConfig: jest.Mock<void, []>;
  setupFileWatch: jest.Mock<void, []>;
  httpPort?: number;
};

export class MockAdapter extends EventEmitter implements ProtocolAdapter {
  protocol = 'sse' as const;

  discover = jest.fn().mockImplementation(async (config: McpServerConfig): Promise<McpServer> => {
    return {
      id: config.id,
      name: `Test Server ${config.id}`,
      version: '2.0.0',
      status: 'connected',
      protocol: config.protocol,
      lastSeen: Date.now(),
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

  checkHeartbeat = jest.fn().mockResolvedValue(true);
  
  executeTask = jest.fn().mockImplementation(async (server: McpServer, task: WorkflowTaskDto) => {
    return { status: 'completed', taskId: task.taskId };
  });
} 