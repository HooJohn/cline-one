import { Controller, Get, Query, Inject } from '@nestjs/common';
import { FileService } from '@interfaces/file-service.interface';

@Controller('code-analysis')
export class CodeAnalysisController {
  constructor(@Inject('FileService') private readonly fileService: FileService) {}

  @Get('complexity')
  async cyclomaticComplexityAnalysis(@Query('path') path: string) {
    const code = await this.fileService.readFile(path);
    // 原始复杂度计算逻辑待移植
    return this.calculateCyclomaticComplexity(code);
  }

  private calculateCyclomaticComplexity(code: string): number {
    // 从cline/src/analyzers/complexity.ts移植核心算法
    let complexity = 1;
    // 增强正则匹配逻辑，避免误匹配注释和字符串
    const decisionPatterns = [
      { pattern: /\b(if|case|for|while)\b/g },       // 控制流关键字
      { pattern: /(\&\&|\|\|)/g },                    // 逻辑运算符
      { pattern: /(\?\?|\?\.)/g },                    // Nullish合并和可选链
      { pattern: /\bcatch\b/g }                       // 异常处理
    ];

    // 移除注释和字符串内容以避免误匹配
    const cleanCode = code
      .replace(/\/\/.*$/gm, '')    // 移除单行注释
      .replace(/\/\*[\s\S]*?\*\//g, '')  // 移除多行注释
      .replace(/".*?"/g, '""')     // 替换双引号字符串
      .replace(/'.*?'/g, "''");     // 替换单引号字符串

    decisionPatterns.forEach(({pattern}) => {
      complexity += (cleanCode.match(pattern) || []).length;
    });

    // 基础复杂度初始值为1

    return complexity;
  }
}
