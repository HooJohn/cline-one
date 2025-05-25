import { Injectable } from '@nestjs/common';
import { LlmAdapterService } from '../llm/llm-adapter.service';
import { ServerRegistry } from '../mcp-gateway/discovery/server-registry';

@Injectable()
export class PolicyManagerService {
  constructor(
    private readonly llmAdapter: LlmAdapterService,
    private readonly serverRegistry: ServerRegistry
  ) {}
}
