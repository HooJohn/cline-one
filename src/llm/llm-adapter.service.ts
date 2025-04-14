import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionPlanDto } from '../orchestration/dto/execution-plan.dto';
import { LlmProvider } from '../interfaces/llm-provider.interface';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LlmAdapterService {
  private readonly logger = new Logger(LlmAdapterService.name);
  private promptTemplates: Record<string, string>;

  private loadPromptTemplates() {
    try {
      const templatePath = path.join(
        process.cwd(),
        this.configService.get('PROMPT_TEMPLATE_PATH') || 'src/config/prompt-templates.yaml'
      );
      const fileContents = fs.readFileSync(templatePath, 'utf8');
      this.promptTemplates = yaml.load(fileContents) as Record<string, string>;
      this.logger.log('成功加载提示词模板');
    } catch (error) {
      this.logger.error('加载提示词模板失败', error.stack);
      throw new Error('无法加载提示词模板配置文件');
    }
  }

  renderTemplate(templateType: string, variables: Record<string, any>) {
    const template = this.promptTemplates.system_templates?.[templateType];
    if (!template) {
      throw new Error(`找不到模板类型：${templateType}`);
    }
    
    return Object.entries(variables).reduce((acc, [key, value]) => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      return acc.replace(placeholder, value);
    }, template);
  }
  async analyze(params: {
    templateType: string;
    variables: Record<string, any>
  }): Promise<{ 
    plan: Array<{
      resourceId: string;
      action: string;
      cpu: number;
      memory: number;
      storage: number;
    }>;
    recommendations: string[];
  }> {
    const { templateType, variables } = params;
    const prompt = this.renderTemplate(templateType, variables);
    
    // 调用实际的LLM接口
    return {
      plan: [{
        resourceId: 'res-001',
        action: 'scale-up',
        cpu: 2,
        memory: 4,
        storage: 50
      }],
      recommendations: ['建议增加缓存层', '优化数据库索引']
    };
  }
  constructor(
    @Inject('LLM_PROVIDER') 
    private readonly provider: LlmProvider,
    private readonly configService: ConfigService
  ) {
    this.loadPromptTemplates();
  }

  async optimizePlan(plan: ExecutionPlanDto): Promise<ExecutionPlanDto> {
    const optimized = await this.provider.optimizePlan(plan);
    return {
      ...optimized,
      tasks: optimized.tasks.sort((a, b) => b.priority - a.priority)
    };
  }

  async generateCompletion(prompt: string) {
    return this.provider.generateResponse(prompt);
  }

  calculateCost(usage: { inputTokens: number; outputTokens: number }) {
    return this.provider.calculateCost(usage);
  }

  getCurrentModelInfo() {
    return this.provider.getModelInfo();
  }
}
