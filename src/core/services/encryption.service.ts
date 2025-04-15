import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly iv: Buffer;

  constructor(private readonly configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('encryption.key');
    const encryptionIv = this.configService.get<string>('encryption.iv');

    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY is not configured');
    }

    this.key = Buffer.from(encryptionKey, 'hex');
    this.iv = encryptionIv ? Buffer.from(encryptionIv, 'hex') : crypto.randomBytes(16);
  }

  encrypt(text: string): string {
    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, this.iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `enc:${encrypted}:${this.iv.toString('hex')}`;
  }

  decrypt(encryptedText: string): string {
    if (!encryptedText.startsWith('enc:')) {
      throw new Error('Invalid encrypted text format');
    }

    const [, encrypted, ivHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
} 