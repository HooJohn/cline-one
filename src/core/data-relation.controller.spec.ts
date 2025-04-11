import { Test, TestingModule } from '@nestjs/testing';
import { DataRelationController } from './data-relation.controller';
import { RedisService } from './data-relation.service';

describe('DataRelationController', () => {
  let controller: DataRelationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DataRelationController],
      providers: [RedisService]
    }).compile();

    controller = module.get<DataRelationController>(DataRelationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
