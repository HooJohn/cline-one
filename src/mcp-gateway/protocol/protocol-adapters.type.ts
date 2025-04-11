import { EventEmitter } from 'events';
import type { McpServer, McpServerConfig } from '../interfaces/mcp-server.interface';
import { HttpAdapter } from './http.adapter';
import { SseAdapter } from './sse.adapter';
import { WebSocketAdapter } from './websocket.adapter';

export interface ProtocolAdapter extends EventEmitter {
  discover(config: McpServerConfig): Promise<McpServer | null>;
  checkHeartbeat(server: McpServer): Promise<boolean>;
  on(event: 'connected', listener: (server: McpServer) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export interface WebSocketAdapterConfig extends McpServerConfig {
  port: number;
  handleBinaryMessages: boolean;
  connectionTimeout: number;
}

export interface SseAdapterConfig extends McpServerConfig {
  endpoint: string;
  keepAliveInterval: number;
  maxRetries: number;
}

export type ProtocolAdapters = {
  http: HttpAdapter;
  stdio: ProtocolAdapter;
  ws: WebSocketAdapter;
  sse: SseAdapter;
};
