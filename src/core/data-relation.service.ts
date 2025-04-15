import { Injectable, Logger } from '@nestjs/common';
import { LlmAdapterService } from '../llm/llm-adapter.service';

@Injectable()
export class DataRelationService {
  private readonly logger = new Logger(DataRelationService.name);

  constructor(
    private readonly llmAdapter: LlmAdapterService
  ) {}

  // analyzeCrossSourceRelations method remains, logic to be updated next

  async analyzeCrossSourceRelations(sources: Array<{
    mcpServer: string;
    resourceUri: string;
    dataType: 'mongodb' | 'mysql' | 'erp';
  }>): Promise<any> {
    this.logger.log(`开始分析数据源关系：${sources.map(s => `${s.mcpServer}:${s.resourceUri}`).join(', ')}`);
    
    this.logger.log(`开始分析数据源关系：${sources.map(s => `${s.mcpServer}:${s.resourceUri}`).join(', ')}`);

    // 1. Build the prompt for the LLM
    // Consider using a template from LlmAdapterService if available and suitable
    // const prompt = this.llmAdapter.renderTemplate('data-relation-analysis', { sources });
    const sourceDescriptions = sources.map((s, i) =>
      `Source ${i + 1}: Type=${s.dataType}, Server=${s.mcpServer}, URI=${s.resourceUri}`
    ).join('\n');
    const prompt = `Analyze the potential relationships, dependencies, and data flows between the following data sources:\n${sourceDescriptions}\n\nDescribe the key relationships and suggest potential integration points or conflicts. Format the response as JSON with keys "relationships" (array of strings) and "recommendations" (array of strings).`;

    this.logger.debug(`Generated data relation analysis prompt: ${prompt.substring(0, 200)}...`);

    try {
      // 2. Call the LLM using generateCompletion
      const llmResultString = await this.llmAdapter.generateCompletion(prompt, {
        // Add metadata if needed for routing
        requestType: 'data-relation-analysis'
      });

      this.logger.debug(`LLM result string: ${llmResultString}`);

      // 3. Parse the LLM response (assuming it returns JSON as requested)
      let analysisResult = { relationships: [], recommendations: [] };
      try {
        // Attempt to find JSON block within the response if the LLM adds extra text
        const jsonMatch = llmResultString.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
        if (jsonMatch) {
           analysisResult = JSON.parse(jsonMatch[1] || jsonMatch[2]);
        } else {
           this.logger.warn('Could not find JSON block in LLM response for data relation analysis. Attempting to parse the whole string.');
           analysisResult = JSON.parse(llmResultString); // Try parsing the whole string
        }
         // Basic validation
         if (!Array.isArray(analysisResult.relationships) || !Array.isArray(analysisResult.recommendations)) {
             throw new Error('Parsed JSON does not have the expected structure ({relationships: [], recommendations: []})');
         }
      } catch (parseError: unknown) {
        this.logger.error(`Failed to parse LLM response for data relation analysis: ${parseError instanceof Error ? parseError.message : '未知错误'}. Raw response: ${llmResultString}`);
        // Return an error structure or throw?
        return {
          correlationId: require('crypto').randomUUID(),
          status: "failed",
          error: "Failed to parse LLM analysis result.",
          rawResponse: llmResultString
        };
      }

      // 4. Return the structured result
      const correlationId = require('crypto').randomUUID();
      return {
        correlationId,
        status: "completed",
        analysis: analysisResult.relationships,
        recommendations: analysisResult.recommendations
      };

    } catch (error: unknown) {
       this.logger.error(`Error during data relation analysis LLM call: ${error instanceof Error ? error.message : '未知错误'}`, error instanceof Error ? error.stack : undefined);
       throw new Error(`Data relation analysis failed: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
}
