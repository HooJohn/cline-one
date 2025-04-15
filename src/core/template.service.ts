import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { RedisService } from './redis.service';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private readonly templateDir: string;
  private templates: Record<string, string> = {};
  
  constructor(
    private readonly redisService: RedisService,
    @Optional() @Inject('TEMPLATE_CONFIG_PATH') private configPath: string = 'config/prompt-templates.yaml'
  ) {
    this.templateDir = path.resolve(process.cwd(), path.dirname(configPath));
    this.loadTemplates(configPath);
    this.watchTemplates(configPath);
  }

  private loadTemplates(configPath: string) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      this.templates = yaml.parse(content);
      this.logger.log(`Loaded ${Object.keys(this.templates).length} templates from ${configPath}`);
    } catch (error: unknown) {
      this.logger.error(`Failed to load templates: ${error instanceof Error ? error.message : '未知错误'}`, error instanceof Error ? error.stack : undefined);
    }
  }

  private watchTemplates(configPath: string) {
    fs.watch(configPath, (event) => {
      if (event === 'change') {
        this.logger.log('Template file changed, reloading...');
        this.loadTemplates(configPath);
      }
    });
  }

  getTemplate(name: string): string | undefined {
    return this.templates[name];
  }

  async renderTemplate(name: string, context: object): Promise<string> {
    const template = this.getTemplate(name);
    if (!template) {
      throw new Error(`Template ${name} not found`);
    }

    // Simple template rendering - could be enhanced with a proper templating engine
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return context[key as keyof typeof context] ?? '';
    });
  }

  async cacheTemplateResult(key: string, result: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.redisService.setEx(`template:${key}`, Math.floor(ttl), result);
    } else {
      await this.redisService.set(`template:${key}`, result);
    }
  }

  async getCachedTemplateResult(key: string): Promise<string | null> {
    return this.redisService.get(key);
  }
}
