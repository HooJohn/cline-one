import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmAdapterService } from '../llm/llm-adapter.service';
import { RoutingPolicyDto } from './dto/routing-policy.dto';
import * as jsonLogic from 'json-logic-js';
import * as fs from 'fs/promises';

// In-memory store structure: { policyName: { version: RoutingPolicyDto } }
type PolicyStore = Record<string, Record<string, RoutingPolicyDto>>;

@Injectable()
export class PolicyManagerService {
  private readonly logger = new Logger(PolicyManagerService.name);
  // Simple in-memory policy store. In production, use a database or config management system.
  private policyStore: PolicyStore = {}; 
  // Track the 'active' version for each policy name
  private activePolicyVersions: Record<string, string> = {}; 

  private policyWatcher: any;
  
  constructor(
    private readonly llmAdapter: LlmAdapterService,
    private readonly configService: ConfigService,
  ) {
    this.loadInitialPolicies();
    this.initPolicyHotReload();
  }

  private initPolicyHotReload(): void {
    const policyPath = this.configService.get('POLICY_CONFIG_PATH');
    if (policyPath) {
      const chokidar = require('chokidar');
      this.policyWatcher = chokidar.watch(policyPath, {
        ignoreInitial: true,
        awaitWriteFinish: true
      });

      this.policyWatcher
        .on('add', path => this.handlePolicyFileChange(path))
        .on('change', path => this.handlePolicyFileChange(path))
        .on('unlink', path => this.handlePolicyFileRemove(path));

      this.logger.log(`Watching policy files at: ${policyPath}`);
    }
  }

  private async handlePolicyFileChange(path: string): Promise<void> {
    try {
      const policyData = await fs.readFile(path, 'utf8');
      const policies: RoutingPolicyDto[] = JSON.parse(policyData);
      policies.forEach(p => this.addOrUpdatePolicy(p));
      this.logger.log(`Updated policies from: ${path}`);
    } catch (error) {
      this.logger.error(`Error loading policy file ${path}: ${error.message}`);
    }
  }

  private async handlePolicyFileRemove(path: string): Promise<void> {
    // Implementation for policy removal
  }

  private loadInitialPolicies(): void {
    // Placeholder: Load default or initial policies if necessary
    this.logger.log('Loading initial policies (placeholder)...');
    // Example:
    // const defaultPolicy: RoutingPolicyDto = { ... };
    // this.addOrUpdatePolicy(defaultPolicy);
    // this.setActivePolicyVersion(defaultPolicy.policyName, defaultPolicy.applicableVersion);
  }

  /**
   * Adds a new policy or updates an existing policy version.
   * @param policy The routing policy DTO.
   * @throws ConflictException if the exact policy name and version already exist.
   */
  addOrUpdatePolicy(policy: RoutingPolicyDto): void {
    const { policyName, applicableVersion } = policy;
    this.logger.log(`Adding/Updating policy: ${policyName}, Version: ${applicableVersion}`);

    if (!this.policyStore[policyName]) {
      this.policyStore[policyName] = {};
    }

    if (this.policyStore[policyName][applicableVersion]) {
      // Optional: Allow overwriting or throw conflict? Current: Throw.
      this.logger.warn(`Policy ${policyName} version ${applicableVersion} already exists.`);
      // Consider if update should overwrite or require a new version.
      // For now, let's assume versions are immutable once added.
      // throw new ConflictException(`Policy ${policyName} version ${applicableVersion} already exists.`);
      // Alternative: Overwrite
       this.logger.log(`Overwriting existing policy ${policyName} version ${applicableVersion}.`);
    }
    
    // TODO: Implement policy conflict detection logic before storing
    // this.detectConflicts(policy); 

    this.policyStore[policyName][applicableVersion] = policy;
    this.logger.log(`Policy ${policyName} version ${applicableVersion} stored.`);

    // Optionally, set the new version as active if it's the first or only one
    if (!this.activePolicyVersions[policyName]) {
        this.setActivePolicyVersion(policyName, applicableVersion);
    }
  }

  /**
   * Sets the active version for a given policy name.
   * @param policyName The name of the policy.
   * @param version The version to set as active.
   * @throws NotFoundException if the policy name or version doesn't exist.
   */
  setActivePolicyVersion(policyName: string, version: string): void {
    if (!this.policyStore[policyName] || !this.policyStore[policyName][version]) {
      this.logger.error(`Policy ${policyName} version ${version} not found.`);
      throw new NotFoundException(`Policy ${policyName} version ${version} not found.`);
    }
    this.activePolicyVersions[policyName] = version;
    this.logger.log(`Active version for policy ${policyName} set to ${version}.`);
  }

  /**
   * Retrieves the currently active policy for a given name.
   * @param policyName The name of the policy.
   * @returns The active RoutingPolicyDto.
   * @throws NotFoundException if the policy name has no active version or doesn't exist.
   */
  getActivePolicy(policyName: string): RoutingPolicyDto {
    const activeVersion = this.activePolicyVersions[policyName];
    if (!activeVersion) {
      this.logger.warn(`No active version set for policy ${policyName}.`);
      throw new NotFoundException(`No active version set for policy ${policyName}.`);
    }

    const policy = this.policyStore[policyName]?.[activeVersion];
    if (!policy) {
       // This case should ideally not happen if setActivePolicyVersion validates correctly
       this.logger.error(`Active policy ${policyName} version ${activeVersion} not found in store.`);
       throw new NotFoundException(`Active policy ${policyName} version ${activeVersion} not found.`);
    }
    
    return policy;
  }

  /**
   * Retrieves a specific policy version.
   * @param policyName The name of the policy.
   * @param version The specific version.
   * @returns The RoutingPolicyDto for the specified version.
   * @throws NotFoundException if the policy name or version doesn't exist.
   */
  getPolicyVersion(policyName: string, version: string): RoutingPolicyDto {
     const policy = this.policyStore[policyName]?.[version];
     if (!policy) {
       this.logger.warn(`Policy ${policyName} version ${version} not found.`);
       throw new NotFoundException(`Policy ${policyName} version ${version} not found.`);
     }
     return policy;
  }

  /**
   * Evaluates a policy's decision logic against provided data context.
   * Placeholder using json-logic-js as an example.
   * @param policy The policy to evaluate.
   * @param dataContext The data context (e.g., task details, system state).
   * @returns The result of the policy evaluation (e.g., boolean, selected route).
   */
  evaluatePolicyLogic(policy: RoutingPolicyDto, dataContext: any): any {
    this.logger.debug(`Evaluating policy logic for ${policy.policyName} v${policy.applicableVersion}`);
    try {
      // Example using json-logic-js
      const result = jsonLogic.apply(policy.decisionLogic, dataContext);
      this.logger.debug(`Policy evaluation result: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      this.logger.error(`Error evaluating policy logic for ${policy.policyName}: ${error.message}`, error.stack);
      // Decide on default behavior on error: fail open/closed?
      return false; // Example: Default to false on error
    }
  }

  /**
   * Placeholder for policy conflict detection logic.
   * This would compare a new/updated policy against existing ones.
   * @param policy The policy being added/updated.
   */
  private detectConflicts(policy: RoutingPolicyDto): void {
    this.logger.warn(`Policy conflict detection not implemented for ${policy.policyName}.`);
    // TODO: Implement logic to check for overlapping conditions or contradictory actions
    // between the incoming policy and existing active policies.
  }

  /**
   * Placeholder for dynamic policy hot-loading mechanism.
   * This could involve watching config files, listening to events, or polling a database.
   */
  async reloadPolicies(): Promise<void> {
     this.logger.warn('Dynamic policy hot-reloading not implemented.');
     // TODO: Implement logic to fetch latest policies from the source of truth
     // and update the in-memory store, potentially detecting changes and conflicts.
     // Example:
     // const latestPolicies = await fetchPoliciesFromSource();
     // latestPolicies.forEach(p => this.addOrUpdatePolicy(p));
     // // Potentially update active versions based on fetched data
  }
}
