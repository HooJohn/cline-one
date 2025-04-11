import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { LlmAdapterService } from '../llm/llm-adapter.service';

@Injectable()
export class RedisService {
  private client: RedisClientType;
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Optional() @Inject(LlmAdapterService) private readonly llmAdapter?: LlmAdapterService
  ) {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
      }
    }) as RedisClientType;
    
    this.client.connect().catch(console.error);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    await this.client.set(key, value);
    if (ttl) {
      await this.client.expire(key, ttl);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async hSet(key: string, field: string, value: string): Promise<number> {
    return this.client.hSet(key, field, value);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    return this.client.hGetAll(key);
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    const subscriber = this.client.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(channel, (message) => callback(message));
  }

  async analyzeCrossSourceRelations(sources: Array<{
    mcpServer: string;
    resourceUri: string;
    dataType: 'mongodb' | 'mysql' | 'erp';
  }>): Promise<any> {
    this.logger.log(`开始分析数据源关系：${sources.map(s => `${s.mcpServer}:${s.resourceUri}`).join(', ')}`);
    
    // 1. 从Redis获取元数据
    const metadataPromises = sources.map(source => 
      this.hGetAll(`metadata:${source.mcpServer}:${source.resourceUri}`)
    );
    const metadataResults = await Promise.all(metadataPromises);
    
    // 2. 准备LLM分析请求
    const analysisPrompt = `请分析以下数据源的关联关系：
${metadataResults.map((meta, i) => `数据源 ${sources[i]}:\n${JSON.stringify(meta, null, 2)}`).join('\n\n')}`;

    // 3. 调用LLM服务
    if (!this.llmAdapter) {
      throw new Error('LLM service unavailable - 请确认以下配置：\n1. LlmModule已正确导入到AppModule\n2. LlmAdapterService已注册为提供者\n3. 环境变量配置正确');
    }
    const llmResponse = await this.llmAdapter.analyze({
      system: "你是一个数据关系分析专家，请识别数据源之间的潜在关联",
      prompt: analysisPrompt
    });

    // 4. 缓存分析结果
    const correlationId = require('crypto').randomUUID();
    await this.set(`analysis:${correlationId}`, JSON.stringify(llmResponse), 3600);

    return { 
      correlationId,
      status: "completed",
      analysis: llmResponse.plan,
      recommendations: llmResponse.recommendations
    };
  }
}
