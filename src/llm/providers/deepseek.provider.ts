import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';
import * as https from 'https';
import { LlmProvider } from '../../interfaces/llm-provider.interface'; // Corrected path


interface DeepseekMessage {
  role: string;
  content: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1秒

@Injectable()
export class DeepseekProvider implements LlmProvider { // Rename class to DeepseekProvider
  private apiKey!: string;
  private readonly apiBase: string;
  private readonly model: string;
  private readonly provider: string;
  private readonly httpsAgent: https.Agent;
  
  constructor(
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }
    this.apiKey = apiKey;
    this.apiBase = this.configService.get<string>('DEEPSEEK_API_BASE') || 'https://api.deepseek.com';
    this.model = this.configService.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    this.provider = 'deepseek';
    
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      timeout: 60000,
      rejectUnauthorized: false
    });
    
    this.validateConfiguration();

    console.log(`当前${this.provider}配置:`, {
      apiBase: this.apiBase,
      model: this.model,
      apiKey: this.apiKey?.substring(0, 6) + '...'
    });
  }

  private validateConfiguration() {
    const configErrors: string[] = [];

    if (!this.apiKey) {
      configErrors.push(`Missing ${this.provider} API Key`);
    } else if (this.apiKey.length < 32) {
      configErrors.push(`Invalid ${this.provider} API Key format`);
    }

    if (!this.apiBase) {
      configErrors.push(`Missing ${this.provider} API Base URL`);
    } else {
      try {
        new URL(this.apiBase);
      } catch (e) {
        configErrors.push('Invalid Deepseek API Base URL format');
      }
    }

    if (!this.model) {
      configErrors.push(`Missing ${this.provider} Model configuration`);
    }

    if (configErrors.length > 0) {
      throw new Error(`Deepseek configuration validation failed:\n${configErrors.join('\n')}`);
    }
  }

  // TODO: 实现计划优化逻辑
  // optimizePlan(plan: ExecutionPlanDto): Promise<ExecutionPlanDto> {
  //   return Promise.resolve(plan);
  // }

  async generateResponse(prompt: string): Promise<string> {
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        const messages: DeepseekMessage[] = [{
          role: "user",
          content: prompt
        }];

        const url = `${this.apiBase}/v1/chat/completions`;
        console.log('发送请求到:', url, '重试次数:', retries);

        // 创建请求配置
        const config: AxiosRequestConfig = {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept-Encoding': 'gzip,deflate,compress',
            'User-Agent': 'Deepseek-Node/1.0'
          },
          timeout: 60000,
          maxRedirects: 5,
          httpsAgent: this.httpsAgent,
          maxBodyLength: 10 * 1024 * 1024,
          maxContentLength: 10 * 1024 * 1024,
          decompress: true,
          validateStatus: (status) => status >= 200 && status < 300
        };

        const response = await axios.post(url, {
          model: this.model,
          messages,
          temperature: 0.7,
          max_tokens: 1000
        }, config);

        if (!response?.data) {
          throw new Error('Empty response from API');
        }

        console.log('请求成功，响应状态:', response.status);
        return response.data.choices[0].message.content;
      } catch (error: unknown) {
        const errorDetails = {
          url: `${this.apiBase}/v1/chat/completions`,
          model: this.model,
          retryAttempt: retries + 1,
          error: {
            name: error instanceof Error ? error.name : '未知错误',
            message: error instanceof Error ? error.message : String(error),
            status: (error as any)?.response?.status,
            statusText: (error as any)?.response?.statusText,
            data: (error as any)?.response?.data,
            headers: {
              request: {
                ...(error as any)?.config?.headers,
                'Authorization': '***'
              },
              response: (error as any)?.response?.headers
            },
            stack: error instanceof Error ? error.stack : undefined
          }
        };

        console.error('API请求详情:', JSON.stringify(errorDetails, null, 2));

        if (retries === MAX_RETRIES - 1) {
          throw new Error(`Deepseek API request failed after ${MAX_RETRIES} retries: ${error instanceof Error ? error.message : String(error)}`);
        }

        retries++;
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries));
      }
    }

    throw new Error(`Deepseek API request failed after ${MAX_RETRIES} retries`);
  }

  calculateCost(usage: { inputTokens: number; outputTokens: number }) {
    return (usage.inputTokens * 0.001) + (usage.outputTokens * 0.002);
  }

  getModelInfo() {
    return {
      name: this.provider,
      version: this.model,
      apiBase: this.apiBase
    };
  }
}
