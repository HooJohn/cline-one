export enum FileType {
  File = 'file',
  Directory = 'directory'
}

export interface FileStat {
  type: FileType;
  mtime: number;
  size: number;
}
