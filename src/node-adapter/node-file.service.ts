import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { FileService } from '@interfaces/file-service.interface';
import { FileStat, FileType } from '@core/enums/file-type.enum';
import { MongoClient, GridFSBucket } from 'mongodb';
import { ConfigService } from '@nestjs/config';

export enum StorageStrategy {
  LOCAL = 'local',
  GRIDFS = 'gridfs'
}

@Injectable()
export class NodeFileService implements FileService, OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NodeFileService.name);
  private mongoClient: MongoClient | null = null;
  private gridFSBucket: GridFSBucket | null = null;
  private storageStrategy: StorageStrategy;

  constructor(private configService: ConfigService) {
    this.storageStrategy = this.configService.get('FILE_STORAGE_STRATEGY') || StorageStrategy.LOCAL;
    
    if (this.storageStrategy === StorageStrategy.GRIDFS) {
      const mongoUri = this.configService.get('MONGODB_URI') || 'mongodb://localhost:27017';
      this.mongoClient = new MongoClient(mongoUri);
      this.gridFSBucket = new GridFSBucket(this.mongoClient.db(), {
        bucketName: 'chat_files'
      });
    }
  }
  
  async readFile(uri: string): Promise<string> {
    return fs.readFile(this.uriToPath(uri), 'utf-8');
  }

  async writeFile(uri: string, content: string): Promise<void> {
    const fullPath = this.uriToPath(uri);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    return fs.writeFile(fullPath, content);
  }

  async uploadFile(file: { buffer: Buffer; originalname: string }, chatId?: string): Promise<string> {
    if (this.storageStrategy === StorageStrategy.GRIDFS && this.gridFSBucket) {
      try {
        const uploadStream = this.gridFSBucket.openUploadStream(file.originalname, {
          metadata: {
            chatId: chatId || '',
            uploadedAt: new Date(),
            size: file.buffer.length
          }
        });

        return new Promise((resolve, reject) => {
          uploadStream.write(file.buffer);
          uploadStream.end((error: Error | null) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(uploadStream.id.toString());
          });
        });
      } catch (error) {
        this.logger.error('GridFS上传异常', error);
        return this.uploadToLocal(file);
      }
    }
    return this.uploadToLocal(file);
  }

  private async uploadToLocal(file: { buffer: Buffer; originalname: string }): Promise<string> {
    const uploadPath = this.configService.get<string>('FILE_UPLOAD_PATH') || './uploads';
    const fallbackPath = path.join(uploadPath, file.originalname);
    await fs.mkdir(uploadPath, { recursive: true });
    await fs.writeFile(fallbackPath, file.buffer);
    return `file://${fallbackPath}`;
  }

  async listFiles(uri: string, recursive = false): Promise<string[]> {
    const entries = await fs.readdir(this.uriToPath(uri), { 
      withFileTypes: true,
      recursive
    });
    return entries
      .filter(dirent => dirent.isFile())
      .map(dirent => `file://${path.join(uri, dirent.name)}`);
  }

  async exists(uri: string): Promise<boolean> {
    try {
      await fs.access(this.uriToPath(uri));
      return true;
    } catch {
      return false;
    }
  }

  private uriToPath(uri: string): string {
    return uri.startsWith('file://') ? uri.slice(7) : uri;
  }

  async stat(uri: string): Promise<FileStat> {
    const stats = await fs.stat(this.uriToPath(uri));
    return {
      type: stats.isDirectory() ? FileType.Directory : FileType.File,
      mtime: stats.mtimeMs,
      size: stats.size
    };
  }

  async onModuleInit() {
    if (this.storageStrategy === StorageStrategy.GRIDFS && !this.mongoClient) {
      const mongoUri = this.configService.get('MONGODB_URI') || 'mongodb://localhost:27017';
      this.mongoClient = new MongoClient(mongoUri, {
        connectTimeoutMS: 5000,
        socketTimeoutMS: 30000,
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10
      });
      
      try {
        await this.mongoClient.connect();
        this.gridFSBucket = new GridFSBucket(this.mongoClient.db(), {
          bucketName: 'chat_files'
        });
        this.logger.log('MongoDB连接成功');
      } catch (error) {
        this.logger.error('MongoDB连接失败', error);
        // 连接失败时自动回退到本地存储
        (this as any).storageStrategy = StorageStrategy.LOCAL;
      }
    }
  }

  async onApplicationShutdown() {
    if (this.mongoClient) {
      try {
        await this.mongoClient.close();
        this.logger.log('MongoDB连接已关闭');
      } catch (error) {
        this.logger.error('关闭MongoDB连接时出错', error);
      }
    }
  }
}
