import { Controller, Post, Body, Param } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { OrchestrationService } from './orchestration.service';
import { WorkflowTaskDto } from './dto/workflow-task.dto';

@Controller('orchestration')
export class OrchestrationController {
  @Post('chat')
  @ApiOperation({ summary: 'Create new chat session' })
  async createChatSession(@Body() body: { userId: string, context?: object }) {
    return this.orchestrationService.createChatSession(body.userId, body.context);
  }

  @Post('chat/:chatId/message')
  @ApiOperation({ summary: 'Add message to chat session' })
  async addChatMessage(
    @Param('chatId') chatId: string,
    @Body() body: { message: string, files?: string[] }
  ) {
    return this.orchestrationService.addChatMessage(chatId, body.message, body.files);
  }
  constructor(private readonly orchestrationService: OrchestrationService) {}
}
