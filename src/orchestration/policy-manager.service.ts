import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

// Define interfaces for the policy structure (adjust as needed)
interface OrchestrationPolicy {
  id: string;
  description?: string;
  trigger: {
    type: string; // e.g., 'api', 'event', 'schedule'
    // Trigger-specific config
  };
  steps: PolicyStep[];
}

interface PolicyStep {
  id: string;
  name: string;
  resource: string; // e.g., 'llm://generate', 'service://user-lookup', 'function://calculate-discount'
  input?: Record<string, any>; // Mapping for step inputs
  output?: string; // Variable name to store step output
  depends_on?: string[];
  condition?: string; // Condition to execute step (e.g., '{{step1.output.status}} == "success"')
  retry_policy?: {
    max_attempts: number;
    delay_ms: number;
  };
}

@Injectable()
export class PolicyManagerService implements OnModuleInit {
  private readonly logger = new Logger(PolicyManagerService.name);
  private policies: Record<string, OrchestrationPolicy> = {};
  private policyFilePath: string;

  constructor(private readonly configService: ConfigService) {
    // Determine policy file path from config or default
    const configPath = this.configService.get<string>('CONFIG_PATH') || 'config';
    this.policyFilePath = path.join(process.cwd(), configPath, 'orchestration-policies.yaml');
  }

  onModuleInit() {
    this.loadPolicies();
  }

  loadPolicies(): void {
    try {
      if (!fs.existsSync(this.policyFilePath)) {
        this.logger.warn(`Orchestration policy file not found at: ${this.policyFilePath}. No policies loaded.`);
        this.policies = {};
        // Optionally create a default empty file?
        // fs.writeFileSync(this.policyFilePath, '# Orchestration Policies\n\n');
        return;
      }

      const fileContents = fs.readFileSync(this.policyFilePath, 'utf8');
      const loadedPolicies = yaml.load(fileContents) as OrchestrationPolicy[] || [];

      this.policies = loadedPolicies.reduce((acc, policy) => {
        if (policy && policy.id) {
          acc[policy.id] = policy;
        } else {
          this.logger.warn('Found policy without an ID, skipping.');
        }
        return acc;
      }, {} as Record<string, OrchestrationPolicy>);

      this.logger.log(`Successfully loaded ${Object.keys(this.policies).length} orchestration policies from ${this.policyFilePath}`);

    } catch (error: unknown) {
      this.logger.error(`Failed to load or parse orchestration policies from ${this.policyFilePath}`, error instanceof Error ? error.stack : undefined);
      // Decide if this should be a fatal error
      // throw new Error(`Failed to load orchestration policies: ${error.message}`);
      this.policies = {}; // Clear policies on error to prevent using stale/invalid data
    }
  }

  getPolicy(policyId: string): OrchestrationPolicy | undefined {
    return this.policies[policyId];
  }

  getAllPolicies(): OrchestrationPolicy[] {
    return Object.values(this.policies);
  }

  // Optional: Add methods to validate policies against a schema
}
