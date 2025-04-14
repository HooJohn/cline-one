import { EventEmitter } from 'events';
import { Injectable, Logger } from '@nestjs/common';
import { McpServer, McpServerConfig } from '../../interfaces/mcp-server.interface';
import { ProtocolAdapter } from './protocol-adapters.type';
import { WorkflowTaskDto } from '../../orchestration/dto/workflow-task.dto';
import axios from 'axios';
import { EventSource } from 'eventsource';

@Injectable()
export class SseAdapter extends EventEmitter implements ProtocolAdapter {
  private readonly logger = new Logger(SseAdapter.name);
  private eventSource: EventSource | null = null;

  async discover(config: McpServerConfig): Promise<McpServer | null> {
    try {
      const response = await axios.get(`${config.endpoint}/info`);
      if (response.status === 200) {
        // 初始化 SSE 连接
        this.setupEventSource(config.endpoint);
        
        return {
          id: config.id,
          name: response.data.name || config.id,
          protocol: 'sse',
          version: response.data.version || '1.0.0',
          status: 'connected',
          lastSeen: Date.now(),
          lastHeartbeat: Date.now(),
          capabilities: response.data.capabilities || {
            tools: [],
            resources: [],
            resourceTemplates: [],
            includes: (capability: string) => false
          },
          config
        };
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to discover server ${config.id}: ${error.message}`);
      return null;
    }
  }

  private setupEventSource(endpoint: string): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(`${endpoint}/events`);

    this.eventSource.onopen = () => {
      this.logger.log('SSE connection established');
    };

    this.eventSource.onerror = (error) => {
      this.logger.error('SSE connection error:', error);
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit('message', data);
      } catch (error) {
        this.logger.error('Failed to parse SSE message:', error);
      }
    };
  }

  async checkHeartbeat(server: McpServer): Promise<boolean> {
    try {
      const response = await axios.get(`${server.config.endpoint}/health`);
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
        timeout: task.timeout || 30000
      });

      if (response.status >= 200 && response.status < 300) {
        return new Promise((resolve, reject) => {
          const taskId = response.data.taskId;
          const timeout = setTimeout(() => {
            reject(new Error(`Task execution timed out after ${task.timeout || 30000}ms`));
          }, task.timeout || 30000);

          const messageHandler = (data: any) => {
            if (data.taskId === taskId) {
              if (data.status === 'completed') {
                clearTimeout(timeout);
                this.removeListener('message', messageHandler);
                resolve(data.result);
              } else if (data.status === 'failed') {
                clearTimeout(timeout);
                this.removeListener('message', messageHandler);
                reject(new Error(data.error));
              }
            }
          };

          this.on('message', messageHandler);
        });
      } else {
        throw new Error(`Task execution failed with status ${response.status}`);
      }
    } catch (error) {
      this.logger.error(`Failed to execute task on server ${server.id}: ${error.message}`);
      throw error;
    }
  }
}
