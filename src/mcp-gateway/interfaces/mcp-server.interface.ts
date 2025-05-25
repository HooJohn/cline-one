export type ServerStatus = 'healthy' | 'unhealthy' | 'unknown' | 'connected';

export interface McpServerConfig {
  id: string;
  protocol: 'http' | 'stdio' | 'ws' | 'sse';
  port?: number;
  disabled?: boolean;
  endpoint?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  autoApprove?: string[];
}

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import type { ProtocolAdapter } from '../protocol/protocol-adapters.type';

export interface McpServer {
  id: string;
  name: string;
  protocol: 'http' | 'stdio' | 'ws' | 'sse';
  version: string;
  status: ServerStatus;
  lastSeen: Date;
  lastHeartbeat: number;
  connection?: WebSocket;
  capabilities: ServerCapabilities & { includes: (capability: string) => boolean };
  config: McpServerConfig;
}

export interface ServerCapabilities {
  tools: string[];
  resources: string[];
  resourceTemplates: string[];
}
