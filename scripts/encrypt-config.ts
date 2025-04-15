#!/usr/bin/env ts-node
import { EncryptionService } from '../src/common/encryption.service';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// 强制加载.env文件
const envPath = path.join(__dirname, '../.env');
console.log('Loading .env from:', envPath);
if (!fs.existsSync(envPath)) {
  console.error('.env file not found at:', envPath);
  process.exit(1);
}
const envConfig = config({ path: envPath }).parsed || {};
console.log('Loaded ENV keys:', Object.keys(envConfig));

// 初始化加密服务
const configService = new ConfigService(envConfig);
const encryptionService = new EncryptionService(configService);

// 要加密的敏感字段
const SENSITIVE_KEYS = [
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY', 
  'ANTHROPIC_API_KEY',
  'MCP_SHARED_SECRET'
];

function encryptFile(filePath: string) {
  const envConfig = require('dotenv').parse(fs.readFileSync(filePath));
  let modified = false;

  for (const key of SENSITIVE_KEYS) {
    if (envConfig[key] && !envConfig[key].startsWith('enc:')) {
      const encrypted = encryptionService.encrypt(envConfig[key]);
      const iv = encryptionService.getCurrentIv();
      envConfig[key] = `enc:${encrypted}:${iv}`;
      modified = true;
      console.log(`Encrypted ${key}`);
    }
  }

  if (modified) {
    // 备份原文件
    const backupPath = `${filePath}.bak`;
    fs.copyFileSync(filePath, backupPath);
    console.log(`Backup created at ${backupPath}`);

    // 写入加密后的文件
    const newContent = Object.entries(envConfig)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    fs.writeFileSync(filePath, newContent);
    console.log(`Encrypted config saved to ${filePath}`);
  } else {
    console.log('No unencrypted sensitive fields found');
  }
}

// 使用示例
const envFile = path.join(__dirname, '../.env');
if (fs.existsSync(envFile)) {
  encryptFile(envFile);
} else {
  console.error('.env file not found');
  process.exit(1);
}
