import { EventEmitter } from 'events';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { McpServer, McpServerConfig, ServerStatus } from '../../interfaces/mcp-server.interface';
import { ProtocolAdapter } from './protocol-adapters.type';
import { WorkflowTaskDto } from '../../orchestration/dto/workflow-task.dto';
import axios from 'axios';
import { EncryptionService } from '../../core/services/encryption.service';

@Injectable()
export class HttpAdapter extends EventEmitter implements ProtocolAdapter {
  private readonly logger = new Logger(HttpAdapter.name);
  private readonly sharedSecret: string | undefined;
  private readonly httpTimeout: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService
  ) {
    super();
    
    // 验证并记录HTTP配置
    const httpPort = this.configService.get<number>('MCP_HTTP_PORT', 3000);
    this.httpTimeout = this.configService.get<number>('MCP_HTTP_TIMEOUT', 30000);
    const maxPayloadSize = this.configService.get<string>('MCP_HTTP_MAX_PAYLOAD_SIZE', '10mb');
    
    this.logger.log(`HTTP Adapter 配置加载成功：
    - MCP端口: ${httpPort}
    - 超时: ${this.httpTimeout}ms
    - 最大负载: ${maxPayloadSize}`);

    // 从MCP配置获取共享密钥
    const encryptedSecret = this.configService.get<string>('MCP_SHARED_SECRET');
    if (!encryptedSecret) {
      throw new Error('MCP_SHARED_SECRET必须配置在环境变量中');
    }
    this.sharedSecret = this.encryptionService.decrypt(encryptedSecret);
    this.logger.log(`HMAC请求签名已启用，密钥长度: ${this.sharedSecret?.length || 0}字节`);
    
    // 初始化事件监听
    this.on('error', (err) => 
      this.logger.error(`Protocol adapter error: ${err.message}`, err.stack));
  }

  private _signRequest(body: string): { signature: string; timestamp: string; nonce: string } | null {
    if (!this.sharedSecret) {
      return null; // Signing disabled if secret is not configured
    }
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const dataToSign = `${timestamp}.${nonce}.${body}`;
    const signature = crypto
      .createHmac('sha256', this.sharedSecret)
      .update(dataToSign)
      .digest('hex');
    return { signature, timestamp, nonce };
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
    // Validate config first
    if (!config?.endpoint) {
      this.logger.error(`Missing endpoint in server config for ${config?.id || 'unknown'}`);
      return this.handleError('Server config missing endpoint');
    }
    
    // Validate URL format
    try {
      new URL(config.endpoint);
    } catch (error) {
      this.logger.error(`Invalid endpoint URL format: ${config.endpoint}`);
      return this.handleError(`Invalid URL: ${config.endpoint}`);
    }

    try {
      const healthUrl = `${config.endpoint}/health`.replace(/([^:]\/)\/+/g, '$1');
      const response = await axios.get(healthUrl, {
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
    const requestBody = JSON.stringify(task);
    const signatureData = this._signRequest(requestBody);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (signatureData) {
      headers['X-Signature-Timestamp'] = signatureData.timestamp;
      headers['X-Signature-Nonce'] = signatureData.nonce;
      headers['X-Signature'] = signatureData.signature;
      this.logger.debug(`Sending request to ${server.id} with HMAC signature.`);
    } else {
       this.logger.debug(`Sending request to ${server.id} without HMAC signature (secret not configured).`);
    }

    try {
      const response = await axios.post(`${server.config.endpoint}/tasks`, requestBody, {
        headers: headers,
        timeout: task.timeout || this.httpTimeout,
        validateStatus: () => true, // Handle status validation below
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
