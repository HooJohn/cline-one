import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';

const { combine, timestamp, printf, colorize } = winston.format;

// 自定义日志格式
const customFormat = printf(({ level, message, timestamp, context, trace }) => {
  return `${timestamp} [${level}] ${context ? `[${context}] ` : ''}${message}${trace ? `\n${trace}` : ''}`;
});

// 创建日志目录
const fs = require('fs');
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// 配置日志选项
export const loggerConfig = {
  transports: [
    // 控制台日志
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp(),
        nestWinstonModuleUtilities.format.nestLike('Cline-One', {
          prettyPrint: true,
        }),
      ),
    }),
    // 信息日志文件
    new winston.transports.DailyRotateFile({
      filename: `${logDir}/info-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info',
      format: combine(timestamp(), customFormat),
    }),
    // 错误日志文件
    new winston.transports.DailyRotateFile({
      filename: `${logDir}/error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
      format: combine(timestamp(), customFormat),
    }),
  ],
  // 全局日志级别
  level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
};

// 导出 Winston 日志实例
export const logger = winston.createLogger(loggerConfig); 