export class AnalyzeDataRelationsDto {
  sources: Array<{
    mcpServer: string;
    resourceUri: string; 
    dataType: 'mongodb' | 'mysql' | 'erp';
  }> = [];
}
