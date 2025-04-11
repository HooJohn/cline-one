import { EventEmitter } from 'events';
import { Injectable } from '@nestjs/common';
import { McpServer, McpServerConfig, ServerStatus } from '../interfaces/mcp-server.interface';
import { ProtocolAdapter } from './protocol-adapters.type';

@Injectable()
export class HttpAdapter extends EventEmitter implements ProtocolAdapter {
  constructor(private readonly port: number) {
    super();
  }

  private handleError(message: string): null {
    this.emit('error', new Error(message));
    return null;
  }

  async discover(config: McpServerConfig): Promise<McpServer | null> {
    try {
      const response = await fetch(`${config.endpoint}/mcp-info`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        return this.handleError(`HTTP request failed: ${response.status} ${response.statusText}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        return this.handleError(`JSON parse error: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (!data.name || !data.version || !data.capabilities) {
        return this.handleError('Invalid server info: missing required fields');
      }

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
          protocol: 'http' as const,
          command: config.command || 'node',
          args: config.args || [],
          env: config.env || {}
        }
      };

      this.emit('connected', data);
      return server;
    } catch (error) {
      return this.handleError(`Network error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async checkHeartbeat(server: McpServer): Promise<boolean> {
    try {
      const response = await fetch(`${server.config.endpoint}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  on(event: 'connected' | 'error', listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}
