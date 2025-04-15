import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;
  private readonly iv: Buffer;

  constructor(private configService: ConfigService) {
    console.log('ConfigService keys:', this.configService['internalConfig']);
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    const encryptionIv = this.configService.get<string>('ENCRYPTION_IV');
    
    if (!encryptionKey) {
      console.error('Encryption key config:', {
        key: encryptionKey,
        iv: encryptionIv,
        allKeys: Object.keys(this.configService['internalConfig'])
      });
      throw new Error('Encryption key is not configured');
    }

    // 从配置中获取或生成随机IV
    this.iv = encryptionIv 
      ? Buffer.from(encryptionIv, 'hex')
      : crypto.randomBytes(16);
      
    // 使用SHA-256哈希确保密钥长度正确
    this.key = crypto.createHash('sha256')
      .update(encryptionKey)
      .digest();
  }

  encrypt(text: string): string {
    const cipher = crypto.createCipheriv(
      this.algorithm, 
      this.key, 
      this.iv
    );
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  decrypt(encryptedText: string): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      this.iv
    );
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  getCurrentIv(): string {
    return this.iv.toString('hex');
  }
}
