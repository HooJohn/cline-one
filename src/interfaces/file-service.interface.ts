import { Injectable } from '@nestjs/common';
import { FileStat } from '@core/enums/file-type.enum';

@Injectable()
export abstract class FileService {
  abstract readFile(path: string): Promise<string>;
  abstract writeFile(path: string, content: string): Promise<void>;
  abstract exists(path: string): Promise<boolean>;
  abstract stat(path: string): Promise<FileStat>;
  abstract listFiles(directory: string, recursive?: boolean): Promise<string[]>;
  abstract readFileSync?(path: string): string;
}
