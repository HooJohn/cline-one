import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, IsArray, IsPositive, IsString } from 'class-validator';

export class RetryPolicy {
  @ApiProperty({
    description: 'Maximum number of retry attempts',
    minimum: 1,
    default: 3
  })
  @IsInt()
  @Min(1)
  maxAttempts: number = 3;

  @ApiProperty({
    description: 'Initial delay between retries in milliseconds',
    minimum: 100,
    default: 1000
  })
  @IsInt()
  @Min(100)
  delay: number = 1000;

  @ApiProperty({
    description: 'Exponential backoff factor',
    minimum: 1,
    default: 2
  })
  @IsPositive()
  backoffFactor: number = 2;

  @ApiProperty({
    description: 'List of error patterns that should trigger retry',
    type: [String],
    example: ['ECONNRESET', 'ETIMEDOUT', '5xx']
  })
  @IsArray()
  @IsString({ each: true })
  retryableErrors: string[] = [];
}
