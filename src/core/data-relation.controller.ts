import { Controller, Post, Body } from '@nestjs/common';
import { RedisService } from './data-relation.service';
import { AnalyzeDataRelationsDto } from './dto/data-relation.dto';

@Controller('data-relation')
export class DataRelationController {
  constructor(private readonly RedisService: RedisService) {}

  @Post('analyze')
  async analyzeRelations(@Body() dto: AnalyzeDataRelationsDto) {
    try {
      const startTime = Date.now();
      const result = await this.RedisService.analyzeCrossSourceRelations(dto.sources);
      const duration = Date.now() - startTime;
      
      return {
        status: 'completed',
        analysisId: result.correlationId,
        durationMs: duration,
        metrics: {
          sourcesAnalyzed: dto.sources.length,
          memoryUsed: process.memoryUsage().heapUsed
        }
      };
    } catch (error) {
      return {
        status: 'error',
        errorCode: 'RELATION_ANALYSIS_FAILED',
        message: error.message,
        details: {
          failedSources: dto.sources,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}
