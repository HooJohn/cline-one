# Cline-One 服务

基于NestJS的智能对话与任务编排服务。

## 当前功能状态

### 1. LLM 集成 (部分实现)
- ✅ 基础的Deepseek API集成
- ❌ 多提供商支持未完成（仅硬编码支持Deepseek/OpenAI兼容API）
- ❌ 动态路由未实现
- ⚠️ 需要完善错误处理和重试机制

### 2. MCP 网关 (部分实现)
- ✅ HTTP协议支持
- ❌ WebSocket支持未实现
- ❌ SSE支持未实现
- ✅ 基础的服务发现功能
- ✅ 版本兼容性检查（支持≥2.3.1或≥3.0.0）
- ✅ Sequential Thinking MCP集成

### 3. 任务队列 (存在问题)
- ⚠️ 任务调度存在逻辑错误（调度器和处理器任务名称不匹配）
- ✅ 支持延迟任务功能
- ✅ 基础的任务重试机制
- ⚠️ Redis连接管理需优化

### 4. 代码分析 (基础实现)
- ✅ 基础的圈复杂度分析
- ✅ 代码清理（注释、字符串处理）

## 实际可用API接口

### 对话服务接口
```
POST /orchestration/chat
```
创建新的聊天会话。

**请求体：**
```json
{
  "userId": "string",
  "context": {
    "source": "string",
    "templateType": "string (optional)",
    "templateData": "object (optional)"
  }
}
```

**响应：**
```json
{
  "_id": "string",
  "userId": "string",
  "context": "object",
  "createdAt": "string"
}
```

```
POST /orchestration/chat/:chatId/message
```
向现有会话发送消息。

**请求体：**
```json
{
  "message": "string",
  "files": ["string"] (optional),
  "metadata": {
    "useTemplate": "boolean (optional)",
    "requiresThinking": "boolean (optional)",
    "thinkingSteps": "number (optional)"
  }
}
```

**响应：**
会返回处理后的消息内容，具体格式取决于处理流程。

### 代码分析接口
```
GET /code-analysis/complexity?path={filePath}
```
分析指定文件的圈复杂度。

### 任务相关接口
```
POST /tasks
```
创建新任务（注意：当前存在调度问题）。

**请求体：**
```json
{
  "taskId": "string",
  "payload": "object",
  "delay": "number (optional)"
}
```

```
GET /tasks/{taskId}/status
```
获取任务状态。

### MCP服务接口
```
GET /api/servers/status
```
获取MCP服务器状态（仅HTTP协议）。

```
POST /api/mcp/tools/execute
```
通过MCP网关执行工具。

**请求体：**
```json
{
  "serverName": "string",
  "toolName": "string",
  "parameters": "object"
}
```

### 工作流执行接口
```
POST /orchestration/workflows/:policyId
```
执行特定的编排工作流策略。

**请求体：**
```json
{
  "context": "object (optional)"
}
```

## MCP服务器集成

### 支持的MCP服务器

#### Sequential Thinking MCP
提供深度思考和逐步推理能力，通过结构化思考过程增强LLM的推理能力。

**配置示例**
```json
{
  "servers": [
    {
      "name": "sequential-thinking",
      "protocol": "stdio",
      "config": {
        "command": "node",
        "args": ["/path/to/sequential-thinking-server/dist/index.js"]
      }
    }
  ]
}
```

**主要工具：**
- `sequentialthinking`: 提供结构化思考能力
  - 输入参数：
    - `thought`: 当前思考步骤
    - `nextThoughtNeeded`: 是否需要继续思考
    - `thoughtNumber`: 当前思考序号
    - `totalThoughts`: 预计总思考步骤数

#### MongoDB MCP (实验性)
提供MongoDB数据库查询和管理能力。

**配置示例**
```json
{
  "servers": [
    {
      "name": "mongodb-mcp",
      "protocol": "http",
      "endpoint": "http://localhost:3001"
    }
  ]
}
```

## 配置说明

### 必需的环境变量
- `DEEPSEEK_API_KEY`: Deepseek API密钥（需加密，以enc:开头）
- `DEEPSEEK_API_BASE`: Deepseek API基础URL（默认为https://api.deepseek.com）
- `DEEPSEEK_MODEL`: Deepseek模型名称（默认为deepseek-chat）
- `MONGODB_URI`: MongoDB连接字符串
- `REDIS_URL`: Redis连接字符串（默认为redis://localhost:6379）
- `PORT`: 服务器端口（默认为4000）
- `JWT_SECRET`: JWT令牌密钥
- `ENCRYPTION_KEY`: 64字符十六进制加密密钥
- `ENCRYPTION_IV`: 32字符十六进制加密初始向量
- `MCP_SHARED_SECRET`: MCP共享密钥（可选）
- `TEMPLATE_PATH`: 提示词模板路径（默认为src/config/prompt-templates.yaml）

### 加密机制
系统使用AES-256-CBC算法加密敏感数据，如API密钥。加密的值以`enc:`前缀开头。

**生成加密密钥**
```bash
# 生成新的加密密钥
$ npm run generate-key

# 加密配置值
$ npm run encrypt-config

# 生成JWT密钥
$ npm run generate-jwt
```

### 提示词模板
系统支持通过YAML文件定义提示词模板，默认位于`src/config/prompt-templates.yaml`。

**模板示例**
```yaml
system_templates:
  tool_invocation: |
    你是一个智能工作流协调器，请根据用户需求选择并调用合适的工具。
    可用工具列表：
    {{tools_list}}
    当前上下文：
    {{context}}
    用户需求：{{user_input}}
```

### MCP服务器配置
MCP服务器配置位于项目根目录的`.mcpconfig`文件中，使用JSON格式。

## 开发环境要求
- Node.js ≥ 16
- Redis 服务器
- MongoDB 服务器
- TypeScript
- NestJS

## 安装与运行
```bash
# 安装依赖
$ npm install

# 开发模式
$ npm run start:dev

# 生产模式 
$ npm run start:prod
```

## 测试
```bash
# 单元测试
$ npm run test

# 单元测试（监听模式）
$ npm run test:watch

# 集成测试
$ npm run test:integration

# e2e测试
$ npm run test:e2e

# 所有测试
$ npm run test:all
```

### 特定测试配置

#### Sequential Thinking MCP测试
需要设置环境变量以启用这些测试：
```bash
$ SEQUENTIAL_THINKING_MCP_ENABLED=true npm run test:e2e
```

#### MongoDB MCP测试
需要设置环境变量以启用这些测试：
```bash
$ MONGODB_MCP_ENABLED=true npm run test:integration
```

## 系统架构

### 核心模块
- **LLM适配器**: 提供统一的大语言模型接口，支持多种提供商
- **MCP网关**: 管理和调用Model Context Protocol服务器
- **编排服务**: 管理复杂任务流程，按策略执行工作流
- **任务队列**: 基于Bull队列的异步任务处理系统
- **提示词模板**: 管理和渲染系统提示词模板

### 数据模型
- **聊天会话**: 管理用户对话上下文
- **消息**: 存储聊天消息内容
- **工作流**: 定义任务执行流程和策略

## 技术栈
- 后端框架：NestJS
- 数据库：MongoDB、Redis
- 任务队列：Bull
- API文档：Swagger
- 测试框架：Jest

## 许可证
[MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE)
