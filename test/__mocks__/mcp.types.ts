import { EventEmitter } from 'events';
import { ProtocolAdapter } from '../../src/mcp-gateway/protocol/protocol-adapters.type';
import { McpServer, McpServerConfig, ServerStatus } from '../../src/interfaces/mcp-server.interface';
import { WorkflowTaskDto } from '../../src/orchestration/dto/workflow-task.dto';

export class MockProtocolAdapter extends EventEmitter implements ProtocolAdapter {
  protocol = 'sse' as const;

  discover = jest.fn().mockImplementation(async (config: McpServerConfig): Promise<McpServer> => {
    return {
      id: config.id,
      name: `Test Server ${config.id}`,
      version: '2.0.0',
      status: 'connected' as ServerStatus,
      protocol: config.protocol,
      lastSeen: Date.now(),
      lastHeartbeat: Date.now(),
      config: config,
      capabilities: {
        tools: [],
        resources: [],
        resourceTemplates: [],
        includes: () => false
      }
    };
  });

  checkHeartbeat = jest.fn().mockResolvedValue(true);
  
  executeTask = jest.fn().mockImplementation(async (server: McpServer, task: WorkflowTaskDto) => {
    return { status: 'completed', taskId: task.taskId };
  });
}

export const createMockServer = (config: McpServerConfig): McpServer => ({
  id: config.id,
  name: `Test Server ${config.id}`,
  version: '2.0.0',
  status: 'connected' as ServerStatus,
  protocol: config.protocol,
  lastSeen: Date.now(),
  lastHeartbeat: Date.now(),
  config: config,
  capabilities: {
    tools: [],
    resources: [],
    resourceTemplates: [],
    includes: () => false
  }
});

export const createMockConfig = (id: string, protocol: 'sse' | 'http' | 'ws' | 'stdio' = 'sse'): McpServerConfig => ({
  id,
  protocol,
  endpoint: `http://localhost:3000/${id}`,
  port: 3000,
  disabled: false,
  autoApprove: ['*']
});
