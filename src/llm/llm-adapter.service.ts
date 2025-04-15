import { Injectable, Inject, Logger, forwardRef, InternalServerErrorException } from '@nestjs/common'; // Add InternalServerErrorException
import { ConfigService } from '@nestjs/config';
import { ExecutionPlanDto } from '../orchestration/dto/execution-plan.dto';
import { LlmProvider } from '../interfaces/llm-provider.interface';
import { LlmRouterService } from './llm-router.service'; // Import LlmRouterService
import { DeepseekProvider } from './providers/deepseek.provider'; // Import specific provider
// Import other providers when available
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LlmAdapterService {
  private readonly logger = new Logger(LlmAdapterService.name);
  private promptTemplates: Record<string, any> = {}; // 初始化为空对象
  private availableProviders: Map<string, LlmProvider>;

  private loadPromptTemplates() {
    try {
      const templatePath = path.join(
        process.cwd(),
        this.configService.get('PROMPT_TEMPLATE_PATH') || 'src/config/prompt-templates.yaml'
      );
      const fileContents = fs.readFileSync(templatePath, 'utf8');
      this.promptTemplates = yaml.load(fileContents) as Record<string, string>;
      this.logger.log('成功加载提示词模板');
    } catch (error: unknown) {
      this.logger.error('加载提示词模板失败', error instanceof Error ? error.stack : undefined);
      throw new Error('无法加载提示词模板配置文件');
    }
  }

  // More robust template rendering supporting nested variables
  renderTemplate(templateType: string, variables: Record<string, any>): string {
    const template = this.promptTemplates?.['system_templates']?.[templateType];
    if (!template) {
      this.logger.error(`Prompt template type not found: ${templateType}`);
      throw new Error(`找不到模板类型：${templateType}`);
    }

    let rendered = template;
    // Basic nested replacement, consider a more robust templating engine for complex cases
    const replacePlaceholders = (text: string, vars: Record<string, any>, prefix = '') => {
      let result = text;
      for (const key in vars) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const placeholder = new RegExp(`{{\\s*${fullKey}\\s*}}`, 'g');
        if (typeof vars[key] === 'object' && vars[key] !== null) {
          result = replacePlaceholders(result, vars[key], fullKey);
        } else {
          result = result.replace(placeholder, String(vars[key]));
        }
      }
      return result;
    };

    rendered = replacePlaceholders(rendered, variables);

    // Check for unresolved placeholders
    const unresolved = rendered.match(/{{\s*[^}]+\s*}}/g);
    if (unresolved) {
       this.logger.warn(`Unresolved placeholders in template ${templateType}: ${unresolved.join(', ')}`);
    }

    return rendered;
  }

  // Updated analyze method to use router and actual LLM call
  async analyze(params: {
    templateType: string;
    variables: Record<string, any>;
    metadata?: Record<string, any>; // Add metadata for routing
  }): Promise<any> { // Return type might need adjustment based on actual LLM response for analysis
    const { templateType, variables, metadata = {} } = params;
    const prompt = this.renderTemplate(templateType, variables);

    try {
      const provider = this.llmRouterService.selectProvider(metadata, this.availableProviders);
      // Assuming the analysis task is a form of completion/generation
      const result = await provider.generateResponse(prompt);
      // TODO: Parse the result string into the expected plan/recommendations structure
      this.logger.log(`Analysis result from ${provider.getModelInfo().name}: ${result.substring(0, 100)}...`);
      // Placeholder parsing - replace with actual logic based on LLM output format
      try {
         // Attempt to parse if result is JSON, otherwise return raw string or handle differently
         return JSON.parse(result);
      } catch (parseError: unknown) {
         this.logger.warn(`Failed to parse analysis result as JSON: ${parseError instanceof Error ? parseError.message : '未知错误'}`);
         return { rawResult: result, recommendations: ["Failed to parse LLM response"] }; // Return raw or error structure
      }
    } catch (error: unknown) {
       this.logger.error(`Error during LLM analysis for template ${templateType}: ${error instanceof Error ? error.message : '未知错误'}`, error instanceof Error ? error.stack : undefined);
       throw new InternalServerErrorException(`LLM analysis failed: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  constructor(
    // Inject Router
    private readonly llmRouterService: LlmRouterService,
    // Inject specific providers (or use ModuleRef to get all tagged providers)
    private readonly deepseekProvider: DeepseekProvider,
    // @Inject(forwardRef(() => AnthropicProvider)) // Example for another provider
    // private readonly anthropicProvider: AnthropicProvider,
    private readonly configService: ConfigService
  ) {
    this.loadPromptTemplates();
    // Initialize the map of available providers
    this.availableProviders = new Map<string, LlmProvider>();
    this.availableProviders.set('deepseek', this.deepseekProvider);
    // Add other providers here
    // this.availableProviders.set('anthropic', this.anthropicProvider);
    this.logger.log(`Initialized LlmAdapterService with providers: ${Array.from(this.availableProviders.keys()).join(', ')}`); // Use this.logger
  }

  // Updated generateCompletion to use router
  async generateCompletion(prompt: string, metadata: Record<string, any> = {}): Promise<string> {
    const provider = this.llmRouterService.selectProvider(metadata, this.availableProviders);
    return provider.generateResponse(prompt);
  }

  // calculateCost might need routing if costs differ significantly
  calculateCost(usage: { inputTokens: number; outputTokens: number }, metadata: Record<string, any> = {}): number {
    // For simplicity, using the first available provider's cost or a default/average
    // A more complex implementation could select provider based on metadata or use specific provider cost
    const provider = this.llmRouterService.selectProvider(metadata, this.availableProviders);
    // Fallback if provider doesn't implement calculateCost
    return typeof provider.calculateCost === 'function'
       ? provider.calculateCost(usage)
       : (usage.inputTokens * 0.001) + (usage.outputTokens * 0.002); // Default fallback cost
  }

  // getModelInfo could return info for the default or selected provider based on metadata
  getCurrentModelInfo(metadata: Record<string, any> = {}) {
    try {
       const provider = this.llmRouterService.selectProvider(metadata, this.availableProviders);
       return provider.getModelInfo();
    } catch (error: unknown) {
        this.logger.warn(`Could not select provider for getModelInfo using metadata, returning info for default provider. Error: ${error instanceof Error ? error.message : '未知错误'}`);
        // Fallback to the first available provider if selection fails
        const firstProvider = this.availableProviders.values().next().value;
        return firstProvider ? firstProvider.getModelInfo() : { name: 'unknown', version: 'unknown' };
    }
  }
}
// REMOVE DUPLICATED BLOCK BELOW
