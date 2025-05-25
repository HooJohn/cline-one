import { Injectable, Logger, Inject } from '@nestjs/common';
import { ServerRegistry } from './server-registry';
import { McpServer } from '../interfaces/mcp-server.interface';
import { McpConfigService } from '../config/mcp-config.service';
import { ProtocolAdapters } from '../protocol/protocol-adapters.type';

@Injectable()
export class McpDiscoveryService {
  private readonly logger = new Logger(McpDiscoveryService.name);

  async registerServer(config: any): Promise<any> {
    const adapter = this.adapters[config.protocol];
    const server = await adapter.discover(config);
    if (this.registry.getServer(server.id)) {
      throw new Error('服务器已存在');
    }
    return this.registry.register(server);
  }
  
  constructor(
    private readonly registry: ServerRegistry,
    private readonly config: McpConfigService,
    @Inject('PROTOCOL_ADAPTERS') private readonly adapters: ProtocolAdapters
  ) {}

  async discoverServers(): Promise<void> {
    const configs = this.config.getServerConfigs();
    
    for (const config of configs) {
      try {
        const adapter = this.adapters[config.protocol];
        const server = await adapter.discover(config);
        
        if (server) {
          this.registry.register(server);
          this.logger.log(`Discovered MCP server: ${server.id}`);
        }
      } catch (error) {
          this.registry.logError(`Discovery failed for ${config.id}`, error);
      }
    }
  }

  startHeartbeatCheck(interval = 30000): void {
    setInterval(async () => {
      for (const server of this.registry.getAllServers()) {
        try {
          const isAlive = await this.adapters[server.protocol].checkHeartbeat(server);
          this.registry.updateStatus(server.id, isAlive ? 'healthy' : 'unhealthy');
        } catch (error) {
          this.registry.updateStatus(server.id, 'unhealthy');
        }
      }
    }, interval);
  }

  verifyCompatibility(server: McpServer): boolean {
    const [major] = server.version.split('.').map(Number);
    return major >= 2; // 要求MCP协议主版本≥2
  }

  getAvailableWorkers(): McpServer[] {
    return this.registry.getAllServers().filter(server => 
      server.status === 'healthy' &&
      server.capabilities.includes('task-processing')
    );
  }

  async checkHeartbeat(serverId: string): Promise<boolean> {
    const server = this.registry.getServer(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    
    try {
      const isAlive = await this.adapters[server.protocol].checkHeartbeat(server);
      this.registry.updateStatus(server.id, isAlive ? 'connected' : 'unhealthy');
      return isAlive;
    } catch (error) {
      this.registry.updateStatus(server.id, 'unhealthy');
      return false;
    }
  }
}
