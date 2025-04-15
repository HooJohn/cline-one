import { Module } from '@nestjs/common';
import { NodeFileService } from './node-file.service';
import { FileService } from '../interfaces/file-service.interface';

@Module({
  providers: [
    NodeFileService,
    {
      provide: 'FileService',
      useClass: NodeFileService
    }
  ],
  exports: [
    NodeFileService,
    'FileService'
  ]
})
export class NodeAdapterModule {}
