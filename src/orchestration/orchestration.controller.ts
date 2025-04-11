import { Controller, Post, Body } from '@nestjs/common';
import { OrchestrationService } from './orchestration.service';

@Controller('orchestration')
export class OrchestrationController {
  constructor(private readonly orchestrationService: OrchestrationService) {}

  @Post('execute')
  async executeWorkflow(@Body() body: { prompt: string }) {
    return this.orchestrationService.handleExecution(body.prompt);
  }
}
