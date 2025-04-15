import { Module } from '@nestjs/common';
import { McpConfigModule } from './config/mcp-config.module';
import { McpConfigService } from './config/mcp-config.service';
import { McpDiscoveryService } from './discovery/mcp-discovery.service';
import { ServerRegistry } from './discovery/server-registry';
import { HttpAdapter } from './protocol/http.adapter';
import { SseAdapter } from './protocol/sse.adapter'; // Import SseAdapter
import { WebSocketAdapter } from './protocol/websocket.adapter'; // Import WebSocketAdapter
import { StdioAdapter } from './protocol/stdio.adapter';
import { ConfigService } from '@nestjs/config'; // Import ConfigService for HttpAdapter
import { CoreModule } from '../core/core.module';
import { McpDiscoveryController } from './discovery/mcp-discovery.controller';

@Module({
  imports: [
    McpConfigModule,
    CoreModule
  ],
  controllers: [
    McpDiscoveryController
  ],
  providers: [
    McpConfigService,
    McpDiscoveryService,
    ServerRegistry,
    // Provide all adapters
    HttpAdapter, // Make HttpAdapter injectable
    SseAdapter, // Make SseAdapter injectable
    WebSocketAdapter, // Make WebSocketAdapter injectable
    StdioAdapter,
    {
      provide: 'PROTOCOL_ADAPTERS',
      useFactory: (
        configService: ConfigService,
        httpAdapter: HttpAdapter, 
        sseAdapter: SseAdapter, 
        wsAdapter: WebSocketAdapter,
        stdioAdapter: StdioAdapter
      ) => ({
        http: httpAdapter,
        sse: sseAdapter,
        websocket: wsAdapter,
        stdio: stdioAdapter
      }),
      inject: [ConfigService, HttpAdapter, SseAdapter, WebSocketAdapter, StdioAdapter]
    }
  ],
  exports: [
    McpDiscoveryService,
    ServerRegistry,
    'PROTOCOL_ADAPTERS'
  ]
})
export class McpGatewayModule {}
