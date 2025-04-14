import { Controller, Post, Body, Get } from '@nestjs/common';
import { McpDiscoveryService } from './mcp-discovery.service';
import { McpServer } from '../../interfaces/mcp-server.interface';

@Controller('mcp/discovery')
export class McpDiscoveryController {
  constructor(private readonly discoveryService: McpDiscoveryService) {}

  @Post('register')
  async registerServer(@Body() server: McpServer) {
    return this.discoveryService.registerServer(server);
  }

  @Get('nodes')
  async getRegisteredNodes() {
    return this.discoveryService.getRegisteredServers();
  }
}
