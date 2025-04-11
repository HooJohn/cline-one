import { EventEmitter } from 'events';
import { McpServer, McpServerConfig, ServerStatus } from '../interfaces/mcp-server.interface';
import { ProtocolAdapter } from './protocol-adapters.type';

export class SseAdapter extends EventEmitter implements ProtocolAdapter {
  public keepAliveInterval = 15000;
  public maxRetries = 3;
  private eventSource: EventSource | null = null;

  private handleError(message: string): null {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    // 使用 process.nextTick 来避免未处理的错误
    process.nextTick(() => {
      try {
        this.emit('error', new Error(message));
      } catch (error) {
        // 在生产环境中，我们可能想要将这些错误发送到错误监控服务
        console.error('Error emitting error event:', error);
      }
    });
    
    return null;
  }

  async discover(config: McpServerConfig): Promise<McpServer | null> {
    try {
      this.eventSource = new EventSource(`${config.endpoint}/mcp-events`);

      return new Promise((resolve) => {
        this.eventSource!.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const server: McpServer = {
              ...config,
              name: data.name,
              version: data.version,
              status: 'connected' as ServerStatus,
              lastSeen: new Date(),
              lastHeartbeat: Date.now(),
              capabilities: data.capabilities,
              config: {
                ...config,
                protocol: 'sse' as const,
                command: config.command || 'node',
                args: config.args || [],
                env: config.env || {}
              }
            };

            // 使用 process.nextTick 来避免未处理的错误
            process.nextTick(() => {
              try {
                this.emit('connected', data);
              } catch (error) {
                console.error('Error emitting connected event:', error);
              }
            });

            resolve(server);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            resolve(this.handleError(`JSON parse error: ${errorMessage}`));
          }
        };

        this.eventSource!.onerror = (err) => {
          const errorMessage = err instanceof Error ? err.message : 'Connection failed';
          resolve(this.handleError(`SSE connection failed: ${errorMessage}`));
        };
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.handleError(`SSE initialization error: ${errorMessage}`);
    }
  }

  async checkHeartbeat(server: McpServer): Promise<boolean> {
    try {
      const response = await fetch(`${server.config.endpoint}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  on(event: 'connected' | 'error', listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}
