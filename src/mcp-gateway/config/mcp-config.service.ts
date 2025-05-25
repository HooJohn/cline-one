import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, watch } from 'fs';
import { join } from 'path';
import type { McpServerConfig } from '../interfaces/mcp-server.interface';

@Injectable()
export class McpConfigService {
  get httpPort(): number {
    return parseInt(process.env.MCP_HTTP_PORT || '3000', 10);
  }
  private readonly logger = new Logger(McpConfigService.name);
  private readonly configPath = join(process.cwd(), '.mcpconfig');
  private servers: McpServerConfig[] = [];

  constructor() {
    this.loadConfig();
    this.setupFileWatch();
  }

  private loadConfig(): void {
    try {
      const rawConfig = readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(rawConfig);
      this.servers = config.servers.map((s: any) => ({
        ...s,
        protocol: s.protocol || 'http',
        disabled: s.disabled || false
      }));
      this.logger.log('Successfully loaded MCP server configurations');
    } catch (error) {
      this.logger.error(`Failed to load MCP config: ${error.message}`);
      this.servers = [];
    }
  }

  private setupFileWatch(): void {
    watch(this.configPath, (eventType) => {
      if (eventType === 'change') {
        this.logger.log('Detected MCP config change, reloading...');
        this.loadConfig();
      }
    });
  }

  getServerConfigs(): McpServerConfig[] {
    return this.servers.filter(s => !s.disabled);
  }

  getServerById(id: string): McpServerConfig | undefined {
    return this.servers.find(s => s.id === id);
  }
}
