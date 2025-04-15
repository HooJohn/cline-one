import { Controller, Post, Body, Get } from '@nestjs/common';
import { McpDiscoveryService } from './mcp-discovery.service';
import { McpServer } from '../../interfaces/mcp-server.interface';

@Controller('api/v1/mcp-gateway')
export class McpDiscoveryController {
  constructor(private readonly discoveryService: McpDiscoveryService) {}

  @Post('register')
  async registerServer(@Body() server: McpServer) {
    return this.discoveryService.registerServer(server);
  }

  @Get('workers')
  async getRegisteredNodes() {
    return this.discoveryService.getRegisteredServers();
  }

  @Get('status')
  async getStatus() {
    return {
      workers: this.discoveryService.getRegisteredServers(),
      status: 'running'
    };
  }
}
