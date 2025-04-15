import { Injectable, Logger, Inject, forwardRef, NotFoundException } from '@nestjs/common';
import { LlmAdapterService } from '../llm/llm-adapter.service';
import { McpDiscoveryService } from '../mcp-gateway/discovery/mcp-discovery.service';
import { WorkflowTaskDto } from './dto/workflow-task.dto'; // Import WorkflowTaskDto
// Import other necessary services for 'service://' and 'function://' if they exist

@Injectable()
export class ResourceLoaderService {
  private readonly logger = new Logger(ResourceLoaderService.name);

  constructor(
    // Use forwardRef if there's a circular dependency with OrchestrationService
    @Inject(forwardRef(() => LlmAdapterService))
    private readonly llmAdapterService: LlmAdapterService,
    @Inject(forwardRef(() => McpDiscoveryService))
    private readonly mcpDiscoveryService: McpDiscoveryService,
    // Inject other services needed for resource types
  ) {}

  async loadResource(resourceUri: string, input: any, context: any): Promise<any> {
    this.logger.debug(`Loading resource: ${resourceUri} with input: ${JSON.stringify(input)}`);

    try {
      const url = new URL(resourceUri);
      const protocol = url.protocol.replace(':', ''); // e.g., 'llm', 'service', 'function'
      const resourcePath = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname; // e.g., 'generate', 'user-lookup/by-id'

      switch (protocol) {
        case 'llm':
          return await this.handleLlmResource(resourcePath, input, context);
        case 'service':
          return await this.handleServiceResource(resourcePath, input, context);
        case 'function':
          return await this.handleFunctionResource(resourcePath, input, context);
        case 'mcp': // Assuming mcp://server-id/tool-name format
           const serverId = url.hostname;
           const toolName = resourcePath;
           return await this.handleMcpResource(serverId, toolName, input, context);
        default:
          throw new Error(`Unsupported resource protocol: ${protocol}`);
      }
    } catch (error: unknown) {
      this.logger.error(`Error parsing or loading resource URI "${resourceUri}": ${error instanceof Error ? error.message : '未知错误'}`, error instanceof Error ? error.stack : undefined);
      throw new Error(`Failed to load resource "${resourceUri}": ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async handleLlmResource(path: string, input: any, context: any): Promise<any> {
    this.logger.log(`Handling LLM resource: ${path}`);
    // Example: Assuming path is 'generate' and input is { prompt: '...' }
    if (path === 'generate' && typeof input?.prompt === 'string') {
      // Apply context if needed (e.g., add system prompt, history)
      const fullPrompt = this.applyContextToPrompt(input.prompt, context);
      return this.llmAdapterService.generateCompletion(fullPrompt);
    } else if (path === 'analyze' && typeof input?.templateType === 'string' && typeof input?.variables === 'object') {
       // This might need adjustment based on how analyze is intended to be used in workflows
       return this.llmAdapterService.analyze(input);
    }
    // Add more LLM resource types as needed
    throw new Error(`Unsupported LLM resource path or invalid input: ${path}`);
  }

  private async handleServiceResource(path: string, input: any, context: any): Promise<any> {
    this.logger.log(`Handling Service resource: ${path}`);
    // TODO: Implement logic to call internal NestJS services based on the path
    // Example: Look up service in a registry or use moduleRef
    // e.g., if path is 'user-lookup/by-id', find UserService and call findById(input.id)
    this.logger.warn(`Service resource handling not yet implemented for path: ${path}`);
    throw new Error(`Service resource handling not implemented: ${path}`);
  }

  private async handleFunctionResource(path: string, input: any, context: any): Promise<any> {
    this.logger.log(`Handling Function resource: ${path}`);
    // TODO: Implement logic to execute predefined local functions
    // Example: Look up function in a registry
    // e.g., if path is 'calculate-discount', call a local calculateDiscount(input.amount, input.userTier)
    this.logger.warn(`Function resource handling not yet implemented for path: ${path}`);
    throw new Error(`Function resource handling not implemented: ${path}`);
  }

   private async handleMcpResource(serverId: string, toolName: string, input: any, context: any): Promise<any> {
    this.logger.log(`Handling MCP resource: Server=${serverId}, Tool=${toolName}`);
    let worker;
    try {
      // Use getWorkerById which internally calls registry.getServer
      worker = (this.mcpDiscoveryService as any).getWorkerById(serverId); // Cast to any temporarily if method is private/protected, or adjust visibility
    } catch (error) {
       // Catch error if getWorkerById throws (e.g., not found)
       this.logger.error(`Failed to get MCP worker ${serverId}: ${error instanceof Error ? error.message : '未知错误'}`, error instanceof Error ? error.stack : undefined);
       throw new NotFoundException(`MCP Server/Worker not found or error retrieving: ${serverId}`);
    }

    if (!worker) { // Double check after potential private access
       throw new NotFoundException(`MCP Server/Worker not found: ${serverId}`);
    }

    // Construct a WorkflowTaskDto based on the MCP tool call
    const generatedTaskId = `mcp-task-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
    const taskDto: WorkflowTaskDto = {
      taskId: generatedTaskId, // Correct property name
      type: `mcp:${toolName}`, // Define a type for MCP tasks
      payload: input,
      // Add default/placeholder values for other required fields
      // These should be refined based on actual workflow needs
      dataSources: [], // Assuming no specific data sources for a direct MCP call here
      modelType: 'none' as any, // Assuming no direct LLM needed for this step, cast to any if 'none' is not in enum
      priority: context?.priority || 5, // Use context priority or default
      resourceEstimate: {}, // Placeholder
      timeout: context?.timeout || 30000, // Use context timeout or default
      retryPolicy: context?.retryPolicy || { max_attempts: 1, delay_ms: 1000 }, // Default retry policy
      // chatId: context?.chatId, // Pass chatId if available in context
      // routingPolicy: context?.routingPolicy // Pass routingPolicy if available
      // Note: 'name' and 'context' are not part of WorkflowTaskDto based on the definition
    };

    try {
      // Use executeTaskOnWorker
      return await this.mcpDiscoveryService.executeTaskOnWorker(serverId, taskDto);
    } catch (error: unknown) {
       this.logger.error(`Error executing MCP tool ${toolName} on server ${serverId}: ${error instanceof Error ? error.message : '未知错误'}`, error instanceof Error ? error.stack : undefined);
       // Re-throw or handle as appropriate for the workflow
       throw new Error(`Failed to execute MCP tool "${toolName}" on server "${serverId}": ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // Helper to potentially modify prompts based on context (e.g., chat history)
  private applyContextToPrompt(prompt: string, context: any): string {
    // Example: Prepend chat history if available
    if (context?.chatHistory && Array.isArray(context.chatHistory)) {
      const historyString = context.chatHistory
        .map((msg: { role: string; content: string }) => `${msg.role}: ${msg.content}`)
        .join('\n');
      return `${historyString}\nuser: ${prompt}`; // Adjust format as needed
    }
    return prompt;
  }
}
