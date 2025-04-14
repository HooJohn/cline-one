import { Injectable, Inject } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { FileService } from '@interfaces/file-service.interface';
import { FileStat, FileType } from '@core/enums/file-type.enum';
import { MongoClient, GridFSBucket } from 'mongodb';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NodeFileService implements FileService {
  private mongoClient: MongoClient;
  private gridFSBucket: GridFSBucket;

  constructor(private configService: ConfigService) {
    const mongoUri = this.configService.get('MONGODB_URI') || 'mongodb://localhost:27017';
    this.mongoClient = new MongoClient(mongoUri);
    this.gridFSBucket = new GridFSBucket(this.mongoClient.db(), {
      bucketName: 'chat_files'
    });
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
    // Upload to GridFS
    const uploadStream = this.gridFSBucket.openUploadStream(file.originalname, {
      metadata: {
        chatId,
        uploadedAt: new Date(),
        size: file.buffer.length
      }
    });

    return new Promise((resolve, reject) => {
      uploadStream.write(file.buffer);
      uploadStream.end((error) => {
        if (error) {
          // Fallback to local filesystem
          const fallbackPath = path.join(this.configService.get('FILE_UPLOAD_PATH'), file.originalname);
          fs.writeFile(fallbackPath, file.buffer)
            .then(() => resolve(`file://${fallbackPath}`))
            .catch(reject);
          return;
        }
        resolve(uploadStream.id.toString());
      });
    });
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
}
