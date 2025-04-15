#!/usr/bin/env ts-node
import { config } from 'dotenv';
import * as crypto from 'crypto';

// 加载环境变量
config();

const encryptValue = (text: string) => {
  const key = Buffer.from(process.env['ENCRYPTION_KEY']!, 'hex');
  const iv = Buffer.from(process.env['ENCRYPTION_IV']!, 'hex');
  
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return `enc:${encrypted}:${iv.toString('hex')}`;
};

// 生成一个随机的共享密钥
const mcpSharedSecret = crypto.randomBytes(32).toString('hex');
const encryptedValue = encryptValue(mcpSharedSecret);

console.log('原始 MCP 共享密钥：');
console.log(mcpSharedSecret);
console.log('\n加密后的值：');
console.log(encryptedValue); 