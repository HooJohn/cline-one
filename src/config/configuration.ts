import * as path from 'path';
import { plainToInstance } from 'class-transformer';
import { validateSync, IsString, IsOptional, IsNumber, IsNotEmpty, Matches } from 'class-validator';

class EnvironmentVariables {
  // LLM 配置
  @IsString()
  @IsNotEmpty()
  @Matches(/^enc:/, { message: 'DEEPSEEK_API_KEY must be encrypted (start with "enc:")' })
  DEEPSEEK_API_KEY!: string;

  @IsString()
  @IsOptional()
  DEEPSEEK_API_BASE: string = 'https://api.deepseek.com';

  @IsString()
  @IsOptional()
  DEEPSEEK_MODEL: string = 'deepseek-chat';

  @IsString()
  @IsOptional()
  OPENAI_API_KEY?: string;

  @IsString()
  @IsOptional()
  ANTHROPIC_API_KEY?: string;

  // 数据库配置
  @IsString()
  @IsNotEmpty()
  MONGODB_URI!: string;

  @IsString()
  @IsOptional()
  REDIS_URL: string = 'redis://localhost:6379';

  // 应用配置
  @IsNumber()
  @IsOptional()
  PORT: number = 4000;

  @IsString()
  @IsOptional()
  NODE_ENV: string = 'development';

  @IsString()
  @IsOptional()
  CONFIG_PATH: string = 'config';

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = '*';

  // MCP 配置
  @IsString()
  @IsNotEmpty()
  @Matches(/^enc:/, { message: 'MCP_SHARED_SECRET must be encrypted (start with "enc:")' })
  MCP_SHARED_SECRET!: string;
  
  // 加密配置
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-f0-9]{64}$/, { message: 'ENCRYPTION_KEY must be a 64-character hex string' })
  ENCRYPTION_KEY!: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-f0-9]{32}$/, { message: 'ENCRYPTION_IV must be a 32-character hex string' })
  ENCRYPTION_IV?: string;
}

export const configuration = () => {
  const config = {
    // LLM 配置
    deepseek: {
      apiKey: process.env['DEEPSEEK_API_KEY'],
      apiBase: process.env['DEEPSEEK_API_BASE'] || 'https://api.deepseek.com',
      model: process.env['DEEPSEEK_MODEL'] || 'deepseek-chat',
    },
    openai: {
      apiKey: process.env['OPENAI_API_KEY'],
    },
    anthropic: {
      apiKey: process.env['ANTHROPIC_API_KEY'],
    },

    // 数据库配置
    database: {
      mongodbUri: process.env['MONGODB_URI'],
      redisUrl: process.env['REDIS_URL'] || 'redis://localhost:6379',
    },

    // 应用配置
    app: {
      port: parseInt(process.env['PORT'] || '4000', 10),
      nodeEnv: process.env['NODE_ENV'] || 'development',
      configPath: process.env['CONFIG_PATH'] || path.join(process.cwd(), 'src/config'),
      jwtSecret: process.env['JWT_SECRET'],
      corsOrigin: process.env['CORS_ORIGIN'] || '*',
    },

    // MCP 配置
    mcp: {
      sharedSecret: process.env['MCP_SHARED_SECRET'],
    },

    // 加密配置
    encryption: {
      key: process.env['ENCRYPTION_KEY'],
      iv: process.env['ENCRYPTION_IV'],
    }
  };

  // 验证配置
  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    process.env,
    { enableImplicitConversion: true }
  );
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Config validation error: ${errors.map(err => 
      `${err.property}: ${Object.values(err.constraints || {}).join(', ')}`
    ).join('; ')}`);
  }

  return config;
};
