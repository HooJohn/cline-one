import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { LlmProvider } from '../interfaces/llm-provider.interface';
// Import specific provider implementations when needed for routing logic
// import { DeepseekProvider } from './providers/deepseek.provider';

// Define interfaces for the routing policy structure (adjust as needed)
interface RoutingRule {
  id: string;
  description?: string;
  match: { // Conditions to match for this rule
    metadata?: Record<string, string>; // e.g., { "userId": "user-123", "requestType": "summary" }
    // Add other matching criteria like input size, etc.
  };
  strategy: 'priority' | 'cost_optimized' | 'round_robin' | 'specific'; // Routing strategy
  providers: string[]; // List of provider names (e.g., ['deepseek', 'anthropic']) or a single provider for 'specific'
  priority?: number; // Used for ordering rules if multiple match
}

interface RoutingPolicies {
  default_strategy?: 'priority' | 'cost_optimized' | 'round_robin';
  default_providers?: string[];
  rules: RoutingRule[];
}

@Injectable()
export class LlmRouterService implements OnModuleInit {
  private readonly logger = new Logger(LlmRouterService.name);
  private policies: RoutingPolicies = { rules: [] };
  private policyFilePath: string;
  private roundRobinCounters: Record<string, number> = {}; // For round_robin strategy

  constructor(
    private readonly configService: ConfigService,
    // Inject available LLM providers if needed for direct access,
    // or rely on LlmAdapterService/Module to provide them.
    // For now, we just load the policy.
  ) {
    const configPath = this.configService.get<string>('CONFIG_PATH') || 'src/config';
    this.policyFilePath = path.join(process.cwd(), configPath, 'routing-policies.yaml');
  }

  onModuleInit() {
    this.loadRoutingPolicies();
  }

  loadRoutingPolicies(): void {
    try {
      if (!fs.existsSync(this.policyFilePath)) {
        this.logger.warn(`Routing policy file not found at: ${this.policyFilePath}. Using default empty policies.`);
        this.policies = { rules: [] };
        // Optionally create a default empty file?
        // fs.writeFileSync(this.policyFilePath, 'rules:\n');
        return;
      }

      const fileContents = fs.readFileSync(this.policyFilePath, 'utf8');
      const loadedConfig = yaml.load(fileContents) as RoutingPolicies || { rules: [] };

      // Basic validation (can be enhanced with class-validator)
      if (!Array.isArray(loadedConfig.rules)) {
         throw new Error('Invalid routing policies format: "rules" must be an array.');
      }
      // TODO: Add more validation for rule structure

      this.policies = loadedConfig;
      this.logger.log(`Successfully loaded ${this.policies.rules.length} routing rules from ${this.policyFilePath}`);

    } catch (error: unknown) {
      this.logger.error(`Failed to load or parse routing policies from ${this.policyFilePath}`, error instanceof Error ? error.stack : undefined);
      this.policies = { rules: [] }; // Clear policies on error
    }
  }

  /**
   * Selects the appropriate LLM provider based on routing policies and request metadata.
   * @param metadata Metadata associated with the request (e.g., userId, requestType).
   * @param availableProviders Map of available provider instances (key: providerName, value: LlmProvider instance).
   * @returns The selected LlmProvider instance.
   * @throws Error if no suitable provider can be found.
   */
  selectProvider(metadata: Record<string, any> = {}, availableProviders: Map<string, LlmProvider>): LlmProvider {
    const matchingRules = this.policies.rules
      .filter(rule => this.ruleMatches(rule, metadata))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)); // Higher priority first

    let selectedProviderName: string | undefined;

    if (matchingRules.length > 0) {
      const bestRule = matchingRules[0];
      this.logger.debug(`Applying routing rule: ${bestRule.id}`);
      selectedProviderName = this.applyStrategy(bestRule.strategy, bestRule.providers, availableProviders);
    }

    // Fallback to default strategy if no rule matched or strategy failed
    if (!selectedProviderName && this.policies.default_providers && this.policies.default_providers.length > 0) {
       this.logger.debug(`Applying default routing strategy: ${this.policies.default_strategy || 'priority'}`);
       selectedProviderName = this.applyStrategy(
           this.policies.default_strategy || 'priority', // Default to priority if not specified
           this.policies.default_providers,
           availableProviders
       );
    }

    if (!selectedProviderName || !availableProviders.has(selectedProviderName)) {
      this.logger.error('Could not select a suitable LLM provider based on routing policies and available providers.', { metadata });
      throw new Error('Failed to select LLM provider.');
    }

    this.logger.log(`Selected LLM Provider: ${selectedProviderName}`);
    return availableProviders.get(selectedProviderName)!;
  }

  private ruleMatches(rule: RoutingRule, metadata: Record<string, any>): boolean {
    if (!rule.match || !rule.match.metadata) {
      return true; // Rule without specific metadata match applies generally (if priority allows)
    }
    for (const key in rule.match.metadata) {
      if (metadata[key] !== rule.match.metadata[key]) {
        return false; // Metadata mismatch
      }
    }
    return true; // All metadata conditions matched
  }

  private applyStrategy(strategy: string, providerNames: string[], availableProviders: Map<string, LlmProvider>): string | undefined {
     const validProviders = providerNames.filter(name => availableProviders.has(name));
     if (validProviders.length === 0) {
         this.logger.warn(`No available providers found for strategy "${strategy}" with candidates: ${providerNames.join(', ')}`);
         return undefined;
     }

     switch (strategy) {
       case 'specific':
         return validProviders[0]; // Takes the first valid provider listed
       case 'priority':
         // Assumes providerNames are already ordered by priority in the YAML
         return validProviders[0];
       case 'round_robin':
         const counterKey = validProviders.join(','); // Use sorted list as key for counter
         this.roundRobinCounters[counterKey] = (this.roundRobinCounters[counterKey] ?? -1) + 1;
         const index = this.roundRobinCounters[counterKey] % validProviders.length;
         return validProviders[index];
       case 'cost_optimized':
         // TODO: Implement cost optimization logic
         // Requires cost data per provider/model - potentially fetched or configured
         this.logger.warn('Cost-optimized strategy not yet implemented, falling back to priority.');
         return validProviders[0]; // Fallback to first available
       default:
         this.logger.warn(`Unknown routing strategy: ${strategy}, falling back to priority.`);
         return validProviders[0]; // Fallback
     }
  }

  // TODO: Add methods to get cost estimates if needed for 'cost_optimized' strategy
}
