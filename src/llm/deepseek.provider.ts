import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';
import * as https from 'https';
import { LlmProvider } from '../interfaces/llm-provider.interface';
import { ExecutionPlanDto } from '../orchestration/dto/execution-plan.dto';


interface DeepseekMessage {
  role: string;
  content: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1秒

@Injectable()
export class DeepseekProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly apiBase: string;
  private readonly model: string;
  private readonly httpsAgent: https.Agent;
  
  constructor(
    private readonly configService: ConfigService
  ) {
    this.apiKey = this.configService.get<string>('deepseek.apiKey');
    this.apiBase = this.configService.get<string>('deepseek.apiBase');
    this.model = this.configService.get<string>('deepseek.model');

    if (!this.apiKey || !this.apiBase || !this.model) {
      throw new Error('Missing required Deepseek configuration');
    }

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 3000,
      rejectUnauthorized: true,
      timeout: 60000,
    });

    console.log('当前Deepseek配置:', {
      apiBase: this.apiBase,
      model: this.model,
      apiKey: this.apiKey?.substring(0, 6) + '...' // 安全显示前6位
    });
  }

  optimizePlan(plan: ExecutionPlanDto): Promise<ExecutionPlanDto> {
    return Promise.resolve(plan);
  }

  async generateResponse(prompt: string): Promise<string> {
    let retries = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1秒

    while (retries < maxRetries) {
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

        console.log('请求配置:', {
          url,
          method: 'POST',
          headers: {
            ...config.headers,
            'Authorization': '***'
          },
          timeout: config.timeout,
          agent: 'Custom HTTPS Agent'
        });

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
      } catch (error) {
        const errorDetails = {
          url: `${this.apiBase}/v1/chat/completions`,
          model: this.model,
          retryAttempt: retries + 1,
          error: {
            name: error.name,
            message: error.message,
            code: error.code,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: {
              request: {
                ...error.config?.headers,
                'Authorization': '***'
              },
              response: error.response?.headers
            },
            stack: error.stack
          }
        };

        console.error('API请求详情:', JSON.stringify(errorDetails, null, 2));

        if (retries === MAX_RETRIES - 1) {
          throw new Error(`Deepseek API request failed after ${MAX_RETRIES} retries: ${error.message}`);
        }

        retries++;
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries));
      }
    }
  }

  calculateCost(usage: { inputTokens: number; outputTokens: number }) {
    return (usage.inputTokens * 0.001) + (usage.outputTokens * 0.002);
  }

  getModelInfo() {
    return {
      name: 'Deepseek',
      version: this.model
    };
  }
}
