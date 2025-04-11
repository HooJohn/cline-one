import { Test, TestingModule } from '@nestjs/testing';
import { CodeAnalysisController } from './code-analysis.controller';
import { FileService } from '../interfaces/file-service.interface';

describe('CodeAnalysisController', () => {
  let controller: CodeAnalysisController;

  const mockFileService = {
    readFile: jest.fn().mockResolvedValue(`
      if (user && permissions) { 
        return config ?? defaults; 
      }
    `),
    writeFile: jest.fn(),
    exists: jest.fn().mockResolvedValue(true),
    readFileSync: jest.fn()
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CodeAnalysisController],
      providers: [
        { provide: FileService, useValue: mockFileService }
      ],
    }).compile();

    controller = module.get<CodeAnalysisController>(CodeAnalysisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should calculate complexity correctly', async () => {
    const result = await controller.cyclomaticComplexityAnalysis('test.js');
    expect(result).toEqual(4); // if(1) + &&(1) + ??(1) + base(1)
    expect(mockFileService.readFile).toHaveBeenCalledWith('test.js');
  });
});
