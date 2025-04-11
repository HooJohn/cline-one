import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { 
  IsNotEmpty, 
  IsArray, 
  ValidateNested, 
  IsEnum, 
  IsInt, 
  Min, 
  Max, 
  IsObject 
} from 'class-validator';
import { AnalyzeDataRelationsDto } from 'src/core/dto/data-relation.dto';
import { ModelIntegrationType } from 'src/core/enums/model-integration-type.enum';
import { RetryPolicy } from 'src/core/dto/retry-policy.dto';

export class WorkflowTaskDto {
  @ApiProperty({ description: 'Unique task identifier' })
  @IsNotEmpty()
  taskId: string;

  @ApiProperty({ description: 'Data sources for this task' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnalyzeDataRelationsDto)
  dataSources: AnalyzeDataRelationsDto[];

  @ApiProperty({ 
    enum: ModelIntegrationType,
    description: 'LLM integration type required' 
  })
  @IsEnum(ModelIntegrationType)
  modelType: ModelIntegrationType;

  @ApiProperty({ description: 'Task priority (1-5)' })
  @IsInt()
  @Min(1)
  @Max(5)
  priority: number;

  @ApiProperty({ description: 'Estimated resource requirements' })
  @IsObject()
  resourceEstimate: Record<string, number>;

  @ApiProperty({ 
    description: 'Task timeout in milliseconds',
    default: 30000
  })
  @IsInt()
  @Min(1000)
  timeout: number = 30000;

  @ApiProperty({
    description: 'Retry policy configuration',
    type: RetryPolicy
  })
  @ValidateNested()
  @Type(() => RetryPolicy)
  retryPolicy: RetryPolicy;
}
