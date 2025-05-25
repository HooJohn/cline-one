import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ServerStatus, McpServer } from '../interfaces/mcp-server.interface';

@Injectable()
export class ServerRegistry implements OnModuleInit {
  private readonly logger = new Logger(ServerRegistry.name);
  private servers = new Map<string, McpServer>();
  
  onModuleInit() {
    this.logger.log('Server registry initialized');
  }

  register(server: McpServer): void {
    const existing = this.servers.get(server.id);
    if (existing) {
      this.logger.warn(`Overwriting existing server registration: ${server.id}`);
    }
    this.servers.set(server.id, server);
  }

  unregister(serverId: string): boolean {
    return this.servers.delete(serverId);
  }

  logError(message: string, error: Error) {
    this.logger.error(`${message}: ${error.message}`, error.stack);
  }

  updateStatus(serverId: string, status: ServerStatus): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.status = status;
      server.lastSeen = new Date();
    }
  }

  getServer(serverId: string): McpServer | undefined {
    return this.servers.get(serverId);
  }

  getAllServers(): McpServer[] {
    return Array.from(this.servers.values());
  }

  clear(): void {
    this.servers.clear();
  }
}
