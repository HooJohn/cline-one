import { Test, TestingModule } from '@nestjs/testing';
import { CodeAnalysisController } from '../../src/core/code-analysis.controller';
import { FileService } from '@interfaces/file-service.interface';

describe('CodeAnalysisController', () => {
  let controller: CodeAnalysisController;
  let mockFileService: jest.Mocked<FileService>;

  beforeEach(async () => {
    mockFileService = {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      exists: jest.fn(),
      stat: jest.fn(),
      listFiles: jest.fn(),
      readFileSync: jest.fn(),
    } as jest.Mocked<FileService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CodeAnalysisController],
      providers: [
        {
          provide: FileService,
          useValue: mockFileService,
        },
      ],
    }).compile();

    controller = module.get<CodeAnalysisController>(CodeAnalysisController);
  });

  describe('cyclomaticComplexityAnalysis', () => {
    it('should calculate cyclomatic complexity correctly for simple code', async () => {
      // 准备一个简单的代码示例
      const sampleCode = `
        function test() {
          if (condition) {
            doSomething();
          }
          for (let i = 0; i < 10; i++) {
            if (i > 5 && i < 8) {
              doSomethingElse();
            }
          }
        }
      `;
      mockFileService.readFile.mockResolvedValue(sampleCode);

      const result = await controller.cyclomaticComplexityAnalysis('test.ts');
      // 期望的复杂度：
      // 1 (基础) + 2 (if语句) + 1 (for循环) + 1 (&&运算符) = 5
      expect(result).toBe(5);
    });

    it('should handle code with comments and strings correctly', async () => {
      const codeWithComments = `
        // if (this is a comment)
        function test() {
          /* 
            if (this is also a comment)
          */
          const str = "if (this is a string)";
          if (realCondition) {
            doSomething();
          }
        }
      `;
      mockFileService.readFile.mockResolvedValue(codeWithComments);

      const result = await controller.cyclomaticComplexityAnalysis('test.ts');
      // 期望的复杂度：
      // 1 (基础) + 1 (if语句) = 2
      expect(result).toBe(2);
    });

    it('should handle error when file cannot be read', async () => {
      mockFileService.readFile.mockRejectedValue(new Error('File not found'));

      await expect(controller.cyclomaticComplexityAnalysis('nonexistent.ts'))
        .rejects.toThrow('File not found');
    });

    it('should calculate complexity for code with various control structures', async () => {
      const complexCode = `
        function complexFunction() {
          try {
            if (condition1) {
              for (let i = 0; i < 10; i++) {
                while (x > 0) {
                  if (a && b || c) {
                    doSomething();
                  }
                }
              }
            }
          } catch (error) {
            handleError();
          }
        }
      `;
      mockFileService.readFile.mockResolvedValue(complexCode);

      const result = await controller.cyclomaticComplexityAnalysis('complex.ts');
      // 期望的复杂度：
      // 1 (基础) + 2 (if语句) + 1 (for循环) + 1 (while循环) + 2 (&&, ||运算符) + 1 (catch) = 8
      expect(result).toBe(8);
    });
  });
}); 