import { Global, Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataRelationService } from './data-relation.service';
import { SharedConfigModule } from '../config/config.module';
import { LlmModule } from '../llm/llm.module';
import { NodeAdapterModule } from '../node-adapter/node-file.module';
import { EncryptionService } from './services/encryption.service';
import { RedisService } from './redis.service';
import { TemplateService } from './template.service';

@Global()
@Module({
  imports: [
    SharedConfigModule,
    forwardRef(() => LlmModule),
    NodeAdapterModule
  ],
  providers: [
    DataRelationService,
    EncryptionService,
    RedisService,
    TemplateService,
    // 修复配置，为TemplateService的第二个参数提供正确的路径配置
    {
      provide: 'TEMPLATE_CONFIG_PATH',
      useFactory: (configService: ConfigService) => 
        configService.get('TEMPLATE_PATH', 'config/prompt-templates.yaml'),
      inject: [ConfigService]
    }
  ],
  exports: [
    DataRelationService,
    EncryptionService,
    RedisService,
    TemplateService,
    // 导出配置token以便其他模块可以使用
    'TEMPLATE_CONFIG_PATH'
  ]
})
export class CoreModule {}
