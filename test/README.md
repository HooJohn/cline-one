# Cline-One 测试说明

本目录包含Cline-One项目的测试套件，涵盖单元测试、集成测试和端到端测试。

## 测试结构

测试目录结构如下：

```
test/
├── e2e/                  # 端到端测试
│   ├── app.e2e-spec.ts   # 应用启动测试
│   └── chat.e2e-spec.ts  # 聊天功能测试
├── integration/          # 集成测试
│   ├── mcp-gateway/      # MCP网关集成测试
│   └── mongodb-mcp.spec.ts # MongoDB MCP集成测试
├── unit/                 # 单元测试
│   ├── config/           # 配置相关测试
│   ├── core/             # 核心服务测试
│   └── llm/              # LLM提供商测试
├── scripts/              # 测试辅助脚本
│   └── test-scripts.json # 测试数据和配置
├── jest-e2e.json         # Jest端到端测试配置
└── test-utils.ts         # 测试工具函数
```

## 测试内容

测试套件涵盖以下主要功能：

1. **单元测试**
   - 配置加载和解密测试
   - 模板服务测试
   - DeepSeek LLM提供商测试

2. **集成测试**
   - MCP服务发现与连接测试
   - MongoDB集成测试
   - Redis缓存集成测试

3. **端到端测试**
   - 应用程序启动测试
   - 健康检查接口测试
   - 聊天会话创建和消息发送测试

## 运行测试

使用以下命令运行测试：

```bash
# 安装测试依赖
npm install --save-dev mongodb-memory-server

# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行端到端测试
npm run test:e2e

# 运行测试并生成代码覆盖率报告
npm run test:cov
```

## 注意事项

1. **环境变量**：测试需要特定的环境变量。创建`.env.test`文件设置测试环境变量，或者在运行测试时手动设置。

2. **MongoDB测试**：MongoDB集成测试需要设置`MONGODB_MCP_ENABLED=true`环境变量才会执行，否则会自动跳过。

3. **Mock和存根**：测试使用Jest的mock功能模拟外部依赖，如HTTP请求、文件系统操作和外部APIs。

4. **测试数据**：`test/scripts/test-scripts.json`文件包含测试用例使用的数据。

5. **测试工具**：`test-utils.ts`提供了创建测试应用实例、模拟请求和响应的辅助函数。

## 添加新测试

添加新测试时，请遵循以下最佳实践：

1. **文件命名**：遵循`*.spec.ts`(单元和集成测试)或`*.e2e-spec.ts`(端到端测试)的命名约定。

2. **测试组织**：使用`describe`和`it`嵌套组织测试用例，确保测试描述清晰。

3. **独立性**：确保测试相互独立，不依赖其他测试的状态。

4. **清理**：在`afterEach`或`afterAll`中清理测试创建的任何资源。

5. **健壮性**：设计健壮的测试，可以处理边缘情况和错误条件。
