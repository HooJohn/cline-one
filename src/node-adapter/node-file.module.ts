import { Module } from '@nestjs/common';
import { NodeFileService } from './node-file.service';
import { FileService } from '../interfaces/file-service.interface';

@Module({
  providers: [
    {
      provide: 'FileService',
      useClass: NodeFileService
    }
  ],
  exports: ['FileService']
})
export class NodeAdapterModule {}
