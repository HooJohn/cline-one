import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';
// Removed unused import: import { ExecutionPlanDto } from './execution-plan.dto';

export class RoutingPolicyDto {
  @ApiProperty({ description: '策略名称标识符' })
  @IsNotEmpty()
  @IsString()
  policyName: string = '';

  @ApiProperty({
    description: '策略决策的JSON逻辑规则',
    example: {
      "==": [
        { "var": "task.priority" }, 
        5
      ]
    }
  })
  @IsNotEmpty()
  @IsObject()
  decisionLogic: Record<string, any> = {};

  @ApiProperty({
    description: '负载均衡策略类型',
    enum: ['round-robin', 'random', 'weighted', 'least-connections', 'latency-based', 'resource-based']
  })
  @IsNotEmpty()
  @IsString()
  policyType: string = '';

  @ApiProperty({
    description: '适用的执行计划版本',
    example: '1.0.0'
  })
  @IsNotEmpty()
  @IsString()
  // Consider adding @Matches(/^\d+\.\d+\.\d+$/, { message: 'Version must be in semver format (e.g., 1.0.0)' }) if strict format is needed
  applicableVersion: string = '';
}
