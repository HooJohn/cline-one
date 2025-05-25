import { WebSocketServer } from 'ws';
import { McpServer, McpServerConfig, ServerStatus } from '../interfaces/mcp-server.interface';
import type { ProtocolAdapter } from './protocol-adapters.type';
import { EventEmitter } from 'events';

export class WebSocketAdapter extends EventEmitter implements ProtocolAdapter {
  private wss: WebSocketServer | null = null;
  private servers: McpServer[] = [];

  constructor(private config: McpServerConfig) {
    super();
  }

  async discover(): Promise<McpServer | null> {
    try {
      this.wss = new WebSocketServer({ port: this.config.port });
      
      this.wss.on('connection', (ws) => {
        const server: McpServer = {
          id: `ws:${this.config.port}`,
          name: 'WebSocket Server',
          protocol: 'ws',
          version: '1.0.0',
          status: 'connected',
          lastSeen: new Date(),
          lastHeartbeat: Date.now(),
          connection: ws,
          config: this.config,
          capabilities: {
            tools: [],
            resources: [],
            resourceTemplates: [],
            includes: (capability: string) => false
          }
        };
        
        this.servers.push(server);
        this.emit('connected', server);
        ws.on('close', () => this.handleDisconnect(server));
        ws.on('message', (data: Buffer) => this.handleMessage(server, data));
      });

      return {
        id: `ws:${this.config.port}`,
        name: 'WebSocket Server',
        protocol: 'ws',
        version: '1.0.0',
        status: 'connected',
        lastSeen: new Date(),
        lastHeartbeat: Date.now(),
        connection: null,
        config: this.config,
        capabilities: {
          tools: [],
          resources: [],
          resourceTemplates: [],
          includes: (capability: string) => false
        }
      };
    } catch (error) {
      this.emit('error', error as Error);
      return null;
    }
  }

  async checkHeartbeat(server: McpServer): Promise<boolean> {
    return server.connection?.readyState === WebSocket.OPEN;
  }

  private handleDisconnect(server: McpServer) {
    this.servers = this.servers.filter(s => s.id !== server.id);
  }

  private handleMessage(server: McpServer, data: Buffer) {
    server.lastHeartbeat = Date.now();
    // 处理消息逻辑
  }
}
