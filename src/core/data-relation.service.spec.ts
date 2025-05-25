import { Test, TestingModule } from '@nestjs/testing';
import { DataRelationService } from './data-relation.service';

describe('DataRelationService', () => {
  let service: DataRelationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataRelationService],
    }).compile();

    service = module.get<DataRelationService>(DataRelationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
