import { Injectable } from '@nestjs/common';
import { ServerRegistry } from '../mcp-gateway/discovery/server-registry';

@Injectable()
export class ResourceOptimizerService {
  constructor(private readonly serverRegistry: ServerRegistry) {}
}
