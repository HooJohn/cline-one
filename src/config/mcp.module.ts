import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { mcpServers } from './mcp-config';

@Module({
  imports: [
    ConfigModule.forFeature(() => ({
      mcp: {
        servers: mcpServers
      }
    }))
  ],
  exports: [ConfigModule]
})
export class McpConfigModule {} 