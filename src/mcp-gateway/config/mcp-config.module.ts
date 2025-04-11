import { Module } from '@nestjs/common';
import { McpConfigService } from './mcp-config.service';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  providers: [McpConfigService],
  exports: [McpConfigService],
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      validationSchema: Joi.object({
        DEEPSEEK_API_KEY: Joi.string().required()
      })
    })
  ]
})
export class McpConfigModule {}
