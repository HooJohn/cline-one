import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import { WinstonModule, utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

// 内存监控阈值（百分比）
const MEMORY_THRESHOLD = 90;
// 内存检查间隔（毫秒）
const MEMORY_CHECK_INTERVAL = 60000;

// 内存优化函数
function optimizeMemory(winstonLogger: winston.Logger) {
  const used = process.memoryUsage();
  const memoryUsagePercent = (used.heapUsed / used.heapTotal) * 100;
  
  if (memoryUsagePercent > MEMORY_THRESHOLD) {
    winstonLogger.warn(`[资源告警] 内存使用率过高 (已用: ${memoryUsagePercent.toFixed(1)}%)，触发优化措施`);
    
    // 强制进行垃圾回收
    if (global.gc) {
      global.gc();
      winstonLogger.info('已执行垃圾回收');
    }
    
    // 其他可能的优化措施
    // 1. 清理大对象
    // 2. 重置缓存
    // 3. 限制并发请求
  }
}

async function bootstrap() {
  // 创建日志目录
  const logDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  // 配置 Winston
  const winstonLogger = winston.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.colorize(),
          winston.format.printf((info) => {
            return `[${info['timestamp']}] ${info['level']}: ${info['message']}`;
          }),
        ),
      }),
      new DailyRotateFile({
        dirname: logDir,
        filename: 'info-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
      new DailyRotateFile({
        dirname: logDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    ],
  });

  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      instance: winstonLogger,
    }),
  });
  const configService = app.get(ConfigService);
  
  // 设置定期内存监控
  setInterval(() => optimizeMemory(winstonLogger), MEMORY_CHECK_INTERVAL);
  
  app.setGlobalPrefix('api/v1');
  await app.listen(configService.get<number>('PORT', 4000));
}

// 启用垃圾回收
if (process.env['NODE_ENV'] === 'production') {
  bootstrap().catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
  });
} else {
  bootstrap();
}
