import { Inject, Injectable, Logger } from '@nestjs/common';
import { LlmAdapterService } from '../llm/llm-adapter.service';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { createClient } from 'redis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private templates = new Map<string, string>();
  private client;

  constructor(
    @Inject('CONFIG_PATH') private readonly configPath: string,
    private readonly llmAdapter: LlmAdapterService
  ) {
    this.loadTemplates();
    this.setupFileWatcher();
    this.initializeRedisClient();
  }

  private async initializeRedisClient() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    await this.client.connect();
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    await this.client.set(key, value);
    if (ttl) {
      await this.client.expire(key, ttl);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }
  
  private async loadTemplates() {
    try {
      const templatePath = path.join(process.cwd(), 'src', this.configPath, 'prompt-templates.yaml');
      this.logger.log(`Loading templates from: ${templatePath}`);
      const content = await fs.promises.readFile(templatePath, 'utf8');
      const parsed = yaml.parse(content);
      
      for (const [name, template] of Object.entries(parsed.system_templates)) {
        this.templates.set(name, template as string);
      }
      
      this.logger.log(`成功加载${this.templates.size}个提示模板`);
    } catch (error) {
      this.logger.error('加载提示模板失败', error.stack);
    }
  }

  private setupFileWatcher() {
    const watchPath = path.join(process.cwd(), 'src', this.configPath);
    this.logger.log(`Setting up file watcher for: ${watchPath}`);
    
    const watcher = fs.watch(watchPath, (eventType, filename) => {
      if (filename === 'prompt-templates.yaml') {
        this.logger.log('检测到模板文件变更，重新加载...');
        this.loadTemplates();
      }
    });
    
    watcher.on('error', error => {
      this.logger.error('文件监视错误', error.stack);
    });
  }

  getTemplate(name: string): string {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`找不到提示模板: ${name}`);
    }
    return template;
  }

  async analyzeCrossSourceRelations(sources: Array<{
    mcpServer: string;
    resourceUri: string;
    dataType: 'mongodb' | 'mysql' | 'erp';
  }>): Promise<any> {
    this.logger.log(`开始分析数据源关系：${sources.map(s => `${s.mcpServer}:${s.resourceUri}`).join(', ')}`);
    
    // 1. 准备LLM分析请求
    const analysisPrompt = `请分析以下数据源的关联关系：
      ${sources.map((s, i) => `数据源 ${i + 1}:\n类型: ${s.dataType}\n路径: ${s.resourceUri}`).join('\n\n')}`;

    // 2. 调用LLM服务
    const llmResponse = await this.llmAdapter.analyze({
      templateType: 'data-relation-analysis',
      variables: {
        analysisPrompt: analysisPrompt
      }
    });

    // 3. 生成分析ID
    const correlationId = require('crypto').randomUUID();

    return { 
      correlationId,
      status: "completed",
      analysis: llmResponse.plan,
      recommendations: llmResponse.recommendations
    };
  }
}
