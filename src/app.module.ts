import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { CodeAnalysisController } from './core/code-analysis.controller';
import { DataRelationController } from './core/data-relation.controller';
import { NodeFileService } from './node-adapter/file-system/node-file.service';
import { FileService } from './interfaces/file-service.interface';
import { DataRelationService } from './core/data-relation.service';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration]
    }),
    OrchestrationModule,
    // 其他必要的模块...
  ],
  controllers: [AppController, CodeAnalysisController, DataRelationController],
  providers: [
    AppService,
    NodeFileService,
    {
      provide: FileService, 
      useExisting: NodeFileService
    },
    DataRelationService
  ],
})
export class AppModule {}
