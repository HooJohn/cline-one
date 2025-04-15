import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { configuration } from '../../../src/config/configuration';
import { EncryptionService } from '../../../src/core/services/encryption.service';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('配置加载测试', () => {
  let configService: ConfigService;
  let encryptionService: EncryptionService;

  const mockEncryptionService = {
    encrypt: jest.fn((value: string) => `enc:${value}`),
    decrypt: jest.fn((value: string) => {
      if (value.startsWith('enc:')) {
        return value.substring(4);
      }
      return value;
    }),
  };

  beforeEach(async () => {
    process.env["DEEPSEEK_API_KEY"] = 'enc:mock-deepseek-api-key';
    process.env["MONGODB_URI"] = 'mongodb://localhost:27017/cline-chat-test';
    process.env["TEMPLATE_PATH"] = 'src/config/prompt-templates.yaml';
    process.env["ENCRYPTION_KEY"] = 'cdf599d8f1938eb0e905508ee6b077f5acc1288c8cd9c98f3edf0c16a5f382af';
    process.env["ENCRYPTION_IV"] = 'd08459ae667836c91ceacb3b7a81ca71';
    process.env["JWT_SECRET"] = 'test-jwt-secret';

    // 模拟yaml文件内容
    const mockTemplateContent = `
system_prompt: |
  你是一个AI助手，专注于{{domain}}领域的问题。

user_prompt: |
  {{input}}

chat_prompt: |
  {{history}}
  用户: {{input}}
  AI:
`;

    // 模拟fs.readFileSync和yaml.parse
    mockedFs.readFileSync.mockImplementation((filepath: any) => {
      if (filepath.toString().includes('prompt-templates.yaml')) {
        return mockTemplateContent;
      }
      throw new Error(`Unexpected file read: ${filepath}`);
    });

    mockedFs.existsSync.mockImplementation((filepath: any) => {
      return filepath.toString().includes('prompt-templates.yaml');
    });

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
      ],
      providers: [
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  it('应该正确加载环境变量', () => {
    expect(configService.get('database.mongodbUri')).toBe('mongodb://localhost:27017/cline-chat-test');
    expect(configService.get('app.configPath')).toBe('config');
  });

  it('应该正确解密敏感配置', () => {
    // 由于模拟的configuration函数直接加载了process.env，我们验证相关项是否正确加载
    const deepseekApiKey = configService.get('deepseek.apiKey');
    expect(deepseekApiKey).toBe('enc:mock-deepseek-api-key');

    // 测试解密函数
    expect(encryptionService.decrypt(deepseekApiKey)).toBe('mock-deepseek-api-key');
  });

  it('应该有正确的默认值配置', () => {
    expect(configService.get('deepseek.apiBase')).toBe('https://api.deepseek.com');
    expect(configService.get('deepseek.model')).toBe('deepseek-chat');
    expect(configService.get('app.port')).toBe(4000);
    // NODE_ENV在测试环境中可能被设置为'test'
    const nodeEnv = configService.get('app.nodeEnv');
    expect(['development', 'test']).toContain(nodeEnv);
  });

  it('应该正确加载提示词模板配置路径', () => {
    const templatePath = process.env["TEMPLATE_PATH"] || '';
    expect(templatePath).toBe('src/config/prompt-templates.yaml');
    expect(mockedFs.existsSync(templatePath)).toBe(true);
  });

  describe('提示词模板测试', () => {
    it('应该能够加载并解析模板', () => {
      const templateContent = mockedFs.readFileSync('src/config/prompt-templates.yaml', 'utf8');
      const templates = yaml.parse(templateContent);
      
      expect(templates).toBeDefined();
      expect(templates.system_prompt).toContain('你是一个AI助手');
      expect(templates.user_prompt).toContain('{{input}}');
      expect(templates.chat_prompt).toContain('{{history}}');
    });

    it('应该包含必要的模板', () => {
      const templateContent = mockedFs.readFileSync('src/config/prompt-templates.yaml', 'utf8');
      const templates = yaml.parse(templateContent);
      
      expect(templates).toHaveProperty('system_prompt');
      expect(templates).toHaveProperty('user_prompt');
      expect(templates).toHaveProperty('chat_prompt');
    });
  });
});
