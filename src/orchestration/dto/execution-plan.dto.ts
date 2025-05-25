import { IsArray, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { WorkflowTaskDto } from './workflow-task.dto';
import { RoutingPolicyDto } from './routing-policy.dto';


export class ExecutionPlanDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowTaskDto)
  tasks: WorkflowTaskDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutingPolicyDto)
  policies: RoutingPolicyDto[];

  @IsString()
  version: string;
}
