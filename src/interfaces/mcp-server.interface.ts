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
  workingDir?: string;
}

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { WorkflowTaskDto } from '../orchestration/dto/workflow-task.dto';
import type { ProtocolAdapter } from '../mcp-gateway/protocol/protocol-adapters.type';

export interface ServerMetrics {
  cpuUsage: number;
  memoryUsage: number;
  avgLatency: number;
  errorRate: number;
  errorCount: number;
  totalTasks: number;
  lastTaskTime?: number;
  lastUpdated: number;
  taskQueueSize: number;
}

export interface McpServer {
  id: string;
  name: string;
  protocol: 'http' | 'stdio' | 'ws' | 'sse';
  version: string;
  status: ServerStatus;
  lastSeen: number;
  lastHeartbeat: number;
  connection?: WebSocket;
  capabilities: ServerCapabilities & { 
    includes: (capability: string) => boolean 
  };
  config: McpServerConfig;
  metrics?: ServerMetrics;
}

export interface ServerCapabilities {
  tools: string[];
  resources: string[];
  resourceTemplates: string[];
}

export interface McpDiscoveryService {
  getOptimalWorker(task: WorkflowTaskDto): Promise<McpWorker>;
  executeTaskOnWorker(workerId: string, task: WorkflowTaskDto): Promise<any>;
}

export interface McpWorker extends McpServer {
  currentLoad: number;
  capacity: number;
}
