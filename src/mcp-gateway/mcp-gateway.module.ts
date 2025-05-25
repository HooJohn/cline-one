import { Module } from '@nestjs/common';
import { McpConfigModule } from './config/mcp-config.module';
import { McpConfigService } from './config/mcp-config.service';
import { McpDiscoveryService } from './discovery/mcp-discovery.service';
import { ServerRegistry } from './discovery/server-registry';
import { HttpAdapter } from './protocol/http.adapter';

@Module({
  imports: [McpConfigModule],
  providers: [
    McpConfigService,
    McpDiscoveryService,
    ServerRegistry,
    {
      provide: 'PROTOCOL_ADAPTERS',
      useFactory: (config: McpConfigService) => ({
        http: new HttpAdapter(config.httpPort)
      }),
      inject: [McpConfigService]
    }
  ],
  exports: [
    McpDiscoveryService,
    ServerRegistry,
    'PROTOCOL_ADAPTERS'
  ]
})
export class McpGatewayModule {}
