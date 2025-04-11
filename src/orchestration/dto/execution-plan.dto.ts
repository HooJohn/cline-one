import { IsArray, ValidateNested, IsString, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger'; // Import ApiProperty
import { WorkflowTaskDto } from './workflow-task.dto';
import { RoutingPolicyDto } from './routing-policy.dto';


export class ExecutionPlanDto {
  optimizationLog: string[]; // 添加缺失的优化日志字段
  @ApiProperty({ 
    description: 'List of tasks included in this execution plan',
    type: [WorkflowTaskDto] 
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowTaskDto)
  tasks: WorkflowTaskDto[];

  @ApiProperty({ 
    description: 'List of routing policies applicable to this plan',
    type: [RoutingPolicyDto] 
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingPolicyDto)
  policies: RoutingPolicyDto[];

  @ApiProperty({ 
    description: 'Version identifier for this execution plan',
    example: '1.0.0' 
  })
  @IsNotEmpty() // Added IsNotEmpty for completeness
  @IsString()
  // Consider adding @Matches(/^\d+\.\d+\.\d+$/, { message: 'Version must be in semver format (e.g., 1.0.0)' }) if strict format is needed
  version: string;
}
