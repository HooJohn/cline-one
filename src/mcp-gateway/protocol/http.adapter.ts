import { EventEmitter } from 'events';
import { Injectable, Logger } from '@nestjs/common';
import { McpServer, McpServerConfig, ServerStatus } from '../../interfaces/mcp-server.interface';
import { ProtocolAdapter } from './protocol-adapters.type';
import { WorkflowTaskDto } from '../../orchestration/dto/workflow-task.dto';
import axios from 'axios';

@Injectable()
export class HttpAdapter extends EventEmitter implements ProtocolAdapter {
  private readonly logger = new Logger(HttpAdapter.name);

  constructor(private readonly port: number) {
    super();
  }

  private handleError(message: string): null {
    process.nextTick(() => {
      try {
        this.emit('error', new Error(message));
      } catch (error) {
        console.error('Error emitting error event:', error);
      }
    });
    return null;
  }

  async discover(config: McpServerConfig): Promise<McpServer | null> {
    try {
      const response = await axios.get(`${config.endpoint}/health`, {
        timeout: 5000,
        validateStatus: () => true
      });

      // Handle non-200 responses
      if (response.status !== 200) {
        this.logger.warn(`Discovery failed for ${config.id} with status ${response.status}`);
        return null;
      }

      // Validate required fields
      if (typeof response.data?.name !== 'string' || typeof response.data?.version !== 'string') {
        this.logger.error(`Missing required fields in response from ${config.id}`);
        return null;
      }

      return {
        id: config.id,
        name: response.data.name,
        protocol: 'http',
        version: response.data.version,
        status: 'connected',
        lastSeen: Date.now(),
        lastHeartbeat: Date.now(),
        capabilities: {
          tools: Array.isArray(response.data?.capabilities?.tools) 
            ? response.data.capabilities.tools : [],
          resources: Array.isArray(response.data?.capabilities?.resources)
            ? response.data.capabilities.resources : [],
          resourceTemplates: Array.isArray(response.data?.capabilities?.resourceTemplates)
            ? response.data.capabilities.resourceTemplates : [],
          includes: (capability: string) => {
            const capabilityList = Array.isArray(response.data?.capabilities?.includes) 
              ? response.data.capabilities.includes
              : [];
            return capabilityList.includes(capability);
          }
        },
        config
      };
    } catch (error) {
      let errorMessage = 'Unknown discovery error';
      if (axios.isAxiosError(error)) {
        errorMessage = `Network error: ${error.code || 'UNKNOWN_CODE'} - ${error.message}`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
          
      this.logger.error(`Failed to discover server ${config.id}: ${errorMessage}`);
      return this.handleError(errorMessage);
    }
  }
  async checkHeartbeat(server: McpServer): Promise<boolean> {
    try {
      const response = await axios.get(`${server.config.endpoint}/health`, {
        timeout: 3000,
        validateStatus: () => true
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async executeTask(server: McpServer, task: WorkflowTaskDto): Promise<any> {
    try {
      const response = await axios.post(`${server.config.endpoint}/tasks`, task, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: task.timeout || 30000,
        validateStatus: () => true
      });

      // Validate response status
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      // Validate task status
      const validStatuses = ['pending', 'running', 'completed', 'failed'];
      if (!validStatuses.includes(response.data?.status?.toLowerCase())) {
        throw new Error(`Invalid task status: ${response.data?.status}`);
      }

      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown task execution error';
      this.logger.error(`Failed to execute task on server ${server.id}: ${errorMessage}`);
      this.handleError(errorMessage);
      throw new Error(`Task execution failed: ${errorMessage}`);
    }
  }
}
