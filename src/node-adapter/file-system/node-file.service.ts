import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { FileService } from '@interfaces/file-service.interface';
import { FileStat, FileType } from '@core/enums/file-type.enum';

@Injectable()
export class NodeFileService implements FileService {
  
  async readFile(uri: string): Promise<string> {
    return fs.readFile(this.uriToPath(uri), 'utf-8');
  }

  async writeFile(uri: string, content: string): Promise<void> {
    const fullPath = this.uriToPath(uri);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    return fs.writeFile(fullPath, content);
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
