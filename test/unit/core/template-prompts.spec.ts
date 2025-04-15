import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { TemplateService } from '../../../src/core/template.service';
import { RedisService } from '../../../src/core/redis.service';

// 模拟fs模块
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

// 模拟yaml模块
jest.mock('yaml');
const mockedYaml = yaml as jest.Mocked<typeof yaml>;

describe('模板提示词测试', () => {
  let service: TemplateService;
  let redisService: RedisService;
  
  // 使用测试模板文件内容
  const realTemplateContent = `
system_prompt: |
  【业务定义】
  星辉印刷是一家专业印刷企业，核心业务包括：
  生产排程管理
  工单工序管理
  物料库存管理
  成品出入库管理
  设备机组管理

user_prompt: |
  {{input}}

chat_prompt: |
  {{history}}
  用户: {{input}}
  AI:

db_query_template: |
  当查询MongoDB数据库时，请遵循以下结构:
  collection, query, projection, sort, limit
`;

  const mockParsedTemplates = {
    'system_prompt': '【业务定义】\n星辉印刷是一家专业印刷企业，核心业务包括：\n生产排程管理\n工单工序管理\n物料库存管理\n成品出入库管理\n设备机组管理\n',
    'user_prompt': '{{input}}',
    'chat_prompt': '{{history}}\n用户: {{input}}\nAI:',
    'db_query_template': '当查询MongoDB数据库时，请遵循以下结构:\ncollection, query, projection, sort, limit'
  };

  beforeEach(async () => {
    // 设置模拟
    mockedFs.readFileSync.mockReturnValue(realTemplateContent);
    mockedYaml.parse.mockReturnValue(mockParsedTemplates);
    mockedFs.existsSync.mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateService,
        {
          provide: RedisService,
          useValue: {
            set: jest.fn().mockResolvedValue(true),
            setEx: jest.fn().mockResolvedValue(true),
            get: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: 'TEMPLATE_CONFIG_PATH',
          useValue: 'test/config/prompt-templates-test.yaml',
        }
      ],
    }).compile();

    service = module.get<TemplateService>(TemplateService);
    redisService = module.get<RedisService>(RedisService);
  });

  it('应该加载测试提示词模板', () => {
    expect(mockedFs.readFileSync).toHaveBeenCalled();
    expect(mockedYaml.parse).toHaveBeenCalled();
    expect(service.getTemplate('system_prompt')).toBe(mockParsedTemplates['system_prompt']);
  });

  it('应该正确渲染业务提示词模板', async () => {
    const rendered = await service.renderTemplate('system_prompt', {});
    // 验证系统提示词模板包含业务特定内容
    expect(rendered).toContain('星辉印刷是一家专业印刷企业');
    expect(rendered).toContain('工单(PNumSumInfo)');
  });

  it('应该正确渲染用户提示词', async () => {
    const userInput = '查询工单P2023001的当前工序状态';
    const rendered = await service.renderTemplate('user_prompt', { 
      input: userInput 
    });
    
    expect(rendered).toBe(userInput);
  });

  it('应该正确渲染聊天提示词', async () => {
    const userInput = '查询设备D-102今日排程';
    const history = '用户: 你好\nAI: 我是星辉印刷助手，有什么可以帮助您？';
    
    const rendered = await service.renderTemplate('chat_prompt', { 
      input: userInput,
      history: history
    });
    
    const expected = `${history}\n用户: ${userInput}\nAI:`;
    expect(rendered).toBe(expected);
  });

  it('应该能够渲染数据库查询模板', async () => {
    const rendered = await service.renderTemplate('db_query_template', {});
    
    expect(rendered).toContain('当查询MongoDB数据库时');
    expect(rendered).toContain('collection, query, projection, sort, limit');
  });

  it('应该将渲染结果缓存到Redis', async () => {
    const userInput = '统计物料M-1001的库存情况';
    const result = await service.renderTemplate('user_prompt', { input: userInput });
    
    await service.cacheTemplateResult('rendered-prompt', result);
    
    expect(redisService.set).toHaveBeenCalledWith('template:rendered-prompt', userInput);
  });
});
