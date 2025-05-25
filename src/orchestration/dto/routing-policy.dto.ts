import { ApiProperty } from '@nestjs/swagger';
import { ExecutionPlanDto } from './execution-plan.dto';

export class RoutingPolicyDto {
  @ApiProperty({ description: '策略名称标识符' })
  policyName: string;

  @ApiProperty({ 
    description: '策略决策的JSON逻辑规则',
    example: {
      "==": [
        { "var": "task.priority" }, 
        5
      ]
    }
  })
  decisionLogic: Record<string, any>;

  @ApiProperty({ 
    description: '适用的执行计划版本',
    example: '1.0.0'
  })
  applicableVersion: string;
}
