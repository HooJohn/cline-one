import { Controller, Post, Body } from '@nestjs/common';
import { DataRelationService } from './data-relation.service';
import { AnalyzeDataRelationsDto } from './dto/data-relation.dto';

@Controller('data-relation')
export class DataRelationController {
  constructor(private readonly dataRelationService: DataRelationService) {}

  @Post('analyze')
  async analyzeRelations(@Body() dto: AnalyzeDataRelationsDto) {
    return this.dataRelationService.analyzeCrossSourceRelations(dto.sources);
  }
}
