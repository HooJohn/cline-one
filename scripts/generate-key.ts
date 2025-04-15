#!/usr/bin/env ts-node
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// 生成32字节的加密密钥
const key = crypto.randomBytes(32).toString('hex');
// 生成16字节的IV
const iv = crypto.randomBytes(16).toString('hex');

const output = `# 新生成的加密密钥 - 请妥善保管
ENCRYPTION_KEY=${key}
# 可选IV - 如果不需要固定IV可以删除
ENCRYPTION_IV=${iv}

# 将此配置添加到.env文件中
# 然后运行 pnpm run encrypt-config 加密敏感数据
`;

const outputPath = path.join(__dirname, 'encryption-keys.env');
fs.writeFileSync(outputPath, output);

console.log(`加密密钥已生成到 ${outputPath}`);
console.log('请将此配置添加到.env文件中，然后运行:');
console.log('pnpm run encrypt-config');
