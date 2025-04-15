import { WebSocketServer } from 'ws';
import type { WebSocketAdapterConfig } from './protocol-adapters.type';
import { McpServer, ServerStatus } from '../../interfaces/mcp-server.interface';
import type { ProtocolAdapter } from './protocol-adapters.type';
import { EventEmitter } from 'events';
import { WorkflowTaskDto } from '../../orchestration/dto/workflow-task.dto';

export class WebSocketAdapter extends EventEmitter implements ProtocolAdapter {
  private wss: WebSocketServer | null = null;
  private servers: McpServer[] = [];

  public handleBinaryMessages = false;
  public connectionTimeout = 30000;

  constructor(private config: WebSocketAdapterConfig) {
    super();
  }

  async discover(): Promise<McpServer | null> {
    try {
      this.wss = new WebSocketServer({ port: this.config.port });
      
      this.wss.on('connection', (ws) => {
        const server: McpServer = {
          id: this.config.id,
          name: 'WebSocket Server',
          protocol: 'ws',
          version: '1.0.0',
          status: 'connected',
          lastSeen: Date.now(),
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
        lastSeen: Date.now(),
        lastHeartbeat: Date.now(),
        connection: undefined,
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

  async executeTask(server: McpServer, task: WorkflowTaskDto): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!server.connection || server.connection.readyState !== WebSocket.OPEN) {
        reject(new Error('Server connection is not open'));
        return;
      }

      const taskId = Date.now().toString();
      const messageHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.taskId === taskId) {
            server.connection?.removeListener('message', messageHandler);
            if (response.status === 'completed') {
              resolve(response.result);
            } else {
              reject(new Error(response.error || 'Task execution failed'));
            }
          }
        } catch (error) {
          reject(error);
        }
      };

      server.connection.on('message', messageHandler);

      const timeout = setTimeout(() => {
        server.connection?.removeListener('message', messageHandler);
        reject(new Error(`Task execution timed out after ${task.timeout || 30000}ms`));
      }, task.timeout || 30000);

      try {
        const { taskId, ...taskWithoutId } = task;
        server.connection?.send(JSON.stringify({ taskId, ...taskWithoutId }));
      } catch (error) {
        clearTimeout(timeout);
        server.connection?.removeListener('message', messageHandler);
        reject(error);
      }
    });
  }

  private handleDisconnect(server: McpServer) {
    this.servers = this.servers.filter(s => s.id !== server.id);
  }

  private handleMessage(server: McpServer, data: Buffer) {
    server.lastHeartbeat = Date.now();
    // 处理消息逻辑
  }
}
