import { Injectable, Inject, Logger, NotFoundException, InternalServerErrorException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose'; // Import InjectModel
import { Model, Types } from 'mongoose'; // Import Model and Types
import { McpDiscoveryService } from '../mcp-gateway/discovery/mcp-discovery.service';
import { WorkflowTaskDto } from './dto/workflow-task.dto';
import { LlmAdapterService } from '../llm/llm-adapter.service';
import { PolicyManagerService } from './policy-manager.service';
import { ResourceLoaderService } from './resource-loader.service';
import { TaskSchedulerService } from '../task-queue/task-scheduler.service';
import { ChatSession, ChatSessionDocument } from './schemas/chat-session.schema'; // Import Mongoose schema/document
import { Message, MessageDocument } from './schemas/message.schema'; // Import Mongoose schema/document

// Remove old interface definition
// export interface ChatSession { ... }

@Injectable()
export class OrchestrationService {
  private readonly logger = new Logger(OrchestrationService.name);
  // Remove in-memory storage: private readonly chatSessions = new Map<string, ChatSession>();

  // --- Chat Session Management (Using Mongoose) ---
  async createChatSession(userId: string, context: object = {}, title?: string): Promise<ChatSessionDocument> {
    this.logger.log(`Creating new chat session for user: ${userId}`);
    const newSession = new this.chatSessionModel({
      userId,
      context,
      title: title || `Chat Session ${new Date().toISOString()}`, // Default title
    });
    try {
      const savedSession = await newSession.save();
      this.logger.log(`Chat session created with ID: ${savedSession._id}`);
      return savedSession;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to create chat session for user ${userId}: ${errorMessage}`, errorStack);
      throw new InternalServerErrorException('Failed to create chat session');
    }
  }

  async addChatMessage(
    chatSessionId: string | Types.ObjectId,
    role: 'user' | 'assistant' | 'system',
    content: string,
    files?: string[],
    metadata?: Record<string, any>
  ): Promise<MessageDocument> {
     this.logger.debug(`Adding ${role} message to session: ${chatSessionId}`);
     // Validate session existence (optional, depends on desired behavior)
     // const sessionExists = await this.chatSessionModel.exists({ _id: chatSessionId });
     // if (!sessionExists) {
     //   throw new NotFoundException(`Chat session not found: ${chatSessionId}`);
     // }

     const newMessage = new this.messageModel({
       chatSessionId,
       role,
       content,
       files,
       metadata,
     });
     try {
       const savedMessage = await newMessage.save();
       this.logger.debug(`Message added with ID: ${savedMessage._id}`);
       return savedMessage;
     } catch (error: unknown) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       const errorStack = error instanceof Error ? error.stack : undefined;
       this.logger.error(`Failed to add message to session ${chatSessionId}: ${errorMessage}`, errorStack);
       throw new InternalServerErrorException('Failed to add chat message');
     }
  }

  // --- End Chat Session Management ---

  constructor(
    // Inject Mongoose Models
    @InjectModel(ChatSession.name) private chatSessionModel: Model<ChatSessionDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    // Other injections
    @Inject(forwardRef(() => McpDiscoveryService))
    private readonly discoveryService: McpDiscoveryService,
    @Inject(forwardRef(() => LlmAdapterService))
    private readonly llmAdapter: LlmAdapterService,
    private readonly policyManager: PolicyManagerService,
    private readonly resourceLoader: ResourceLoaderService,
    private readonly taskScheduler: TaskSchedulerService,
  ) {}

   // --- Workflow Execution (Keep as is) ---
   /**
   * Executes an orchestration policy.
   * @param policyId The ID of the policy to execute.
   * @param initialContext Initial data for the workflow context.
   * @returns The final execution context containing results.
   */
  async executeWorkflow(policyId: string, initialContext: Record<string, any> = {}): Promise<Record<string, any>> {
    this.logger.log(`Executing workflow for policy ID: ${policyId}`);
    const policy = this.policyManager.getPolicy(policyId);

    if (!policy) {
      this.logger.error(`Policy not found: ${policyId}`);
      throw new NotFoundException(`Orchestration policy with ID "${policyId}" not found.`);
    }

    const executionContext: Record<string, any> = { ...initialContext }; // Clone initial context
    const stepResults: Record<string, any> = {}; // Store results of each step

    // Basic sequential execution - needs enhancement for dependencies, conditions, parallelism
    for (const step of policy.steps) {
      this.logger.debug(`Executing step: ${step.id} (${step.name}) - Resource: ${step.resource}`);

      // TODO: Implement dependency checking (depends_on)
      // TODO: Implement condition checking (condition) - Requires template engine/evaluation

      try {
        // Resolve input variables from context/previous steps
        const stepInput = this.resolveStepInput(step.input || {}, executionContext, stepResults);

        // Execute the resource
        // Pass both the global execution context and specific step results for resolving inputs if needed
        const result = await this.resourceLoader.loadResource(step.resource, stepInput, executionContext);

        // Store result if output variable is defined
        if (step.output) {
          stepResults[step.id] = result; // Store raw result associated with step ID
          executionContext[step.output] = result; // Store result in the main context under the specified key
          this.logger.debug(`Step ${step.id} output stored in context as '${step.output}'`);
        } else {
           stepResults[step.id] = result; // Store result even if not mapped to context key
        }

        this.logger.debug(`Step ${step.id} executed successfully.`);

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`Error executing step ${step.id} (${step.name}): ${errorMessage}`, errorStack);
        // TODO: Implement error handling strategies (e.g., retry based on step.retry_policy, fail workflow)
        throw new InternalServerErrorException(`Workflow execution failed at step "${step.name}": ${errorMessage}`);
      }
    }

    this.logger.log(`Workflow for policy ID: ${policyId} completed successfully.`);
    // Return the final context, which includes initial context + all step outputs mapped via 'output' key
    return executionContext;
  }

  // Helper function to resolve step inputs using context data
  private resolveStepInput(inputTemplate: Record<string, any>, context: Record<string, any>, stepResults: Record<string, any>): Record<string, any> {
      const resolvedInput: Record<string, any> = {};
      for (const key in inputTemplate) {
          const valueTemplate = inputTemplate[key];
          if (typeof valueTemplate === 'string' && valueTemplate.startsWith('{{') && valueTemplate.endsWith('}}')) {
              // Simple placeholder replacement (e.g., {{initialContext.userId}}, {{step1.output}})
              // Needs a more robust template engine for complex expressions
              const placeholder = valueTemplate.substring(2, valueTemplate.length - 2).trim();
              const parts = placeholder.split('.');
              let resolvedValue: any;

              if (parts[0] === 'context') {
                 resolvedValue = this.resolvePlaceholder(parts.slice(1), context);
              } else if (parts.length > 1 && stepResults[parts[0]]) {
                 // Assumes format like "stepId.some.property"
                 resolvedValue = this.resolvePlaceholder(parts.slice(1), stepResults[parts[0]]);
              } else {
                 this.logger.warn(`Could not resolve placeholder: ${valueTemplate}. Using literal value.`);
                 resolvedValue = valueTemplate; // Use as literal if not resolvable
              }
              resolvedInput[key] = resolvedValue;
          } else {
              resolvedInput[key] = valueTemplate; // Use literal value
          }
      }
      return resolvedInput;
  }

  // Basic nested property resolver
  private resolvePlaceholder(pathParts: string[], source: any): any {
      let current = source;
      for (const part of pathParts) {
          if (current && typeof current === 'object' && part in current) {
              current = current[part];
          } else {
              return undefined; // Path not found
          }
      }
      return current;
  }


  // Keep scheduleTask and handleExecution for now, might be refactored/removed later
  async scheduleTask(task: WorkflowTaskDto) {
    const worker = await this.discoveryService.getOptimalWorker(task);
    return this.discoveryService.executeTaskOnWorker(worker.id, task);
  }

  async handleExecution(prompt: string) {
    try {
      const result = await this.llmAdapter.generateCompletion(prompt);
      return {
        success: true,
        response: result,
        metadata: {
          model: this.llmAdapter.getCurrentModelInfo(),
          timestamp: new Date().toISOString()
        }
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }
}
