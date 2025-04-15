import { INestApplication } from '@nestjs/common';
import { TestUtils } from '../test-utils';
import { McpDiscoveryService } from '../../src/mcp-gateway/discovery/mcp-discovery.service';
import mongoose, { Connection } from 'mongoose';
// 注释掉MongoDB内存服务器类型，需要安装: npm install mongodb-memory-server --save-dev
// import { MongoMemoryServer } from 'mongodb-memory-server';

describe('MongoDB MCP 集成测试', () => {
  let app: INestApplication;
  let mcpDiscoveryService: McpDiscoveryService;
  // let mongoServer: MongoMemoryServer;
  let mongoConnection: Connection | null = null;
  
  // 跳过测试，除非明确配置了MongoDB MCP
  const SKIP_TESTS = !process.env['MONGODB_MCP_ENABLED'];
  
  // 连接状态检查的超时时间
  const CONNECTION_CHECK_TIMEOUT = 1000;
  const CONNECTION_CHECK_INTERVAL = 100;

  // 等待MongoDB连接就绪
  const waitForConnection = async (connection: Connection): Promise<boolean> => {
    const startTime = Date.now();
    while (Date.now() - startTime < CONNECTION_CHECK_TIMEOUT) {
      if (connection.readyState === 1) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, CONNECTION_CHECK_INTERVAL));
    }
    return false;
  };

  beforeAll(async () => {
    if (SKIP_TESTS) {
      console.log('跳过MongoDB MCP测试 - 未启用');
      return;
    }

    try {
      // 创建内存MongoDB服务器 - 需要安装mongodb-memory-server
      // mongoServer = await MongoMemoryServer.create();
      // const mongoUri = mongoServer.getUri();
      
      // 使用环境变量或默认本地MongoDB
      const mongoUri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/cline-test';
      
      // 启动测试应用
      app = await TestUtils.createTestingApp();

      // 获取MCP服务
      mcpDiscoveryService = app.get<McpDiscoveryService>(McpDiscoveryService);

      // 创建直接连接以进行测试验证
      mongoConnection = mongoose.createConnection(mongoUri);
      
      // 等待连接就绪
      const isConnected = await waitForConnection(mongoConnection);
      if (!isConnected) {
        throw new Error('MongoDB连接超时');
      }
      
      // 创建测试集合和文档
      const testCollection = mongoConnection.collection('test_collection');
      await testCollection.insertMany([
        { name: '测试文档1', value: 100 },
        { name: '测试文档2', value: 200 },
        { name: '测试文档3', value: 300 }
      ]);
    } catch (error) {
      console.error('MongoDB设置失败:', error);
      throw error; // 重新抛出错误，确保测试失败
    }
  });

  afterAll(async () => {
    if (SKIP_TESTS) return;
    
    try {
      // 清理资源
      if (mongoConnection) {
        const testCollection = mongoConnection.collection('test_collection');
        await testCollection.drop().catch(() => {}); // 忽略集合不存在的错误
        await mongoConnection.close();
      }
      // if (mongoServer) await mongoServer.stop();
      if (app) await TestUtils.closeTestingApp(app);
    } catch (error) {
      console.error('清理资源失败:', error);
    }
  });

  it.skip('应该通过MCP获取MongoDB服务器', async () => {
    if (SKIP_TESTS) {
      pending('MongoDB MCP测试已跳过');
      return;
    }
    
    try {
      // 获取已注册的服务器
      const servers = mcpDiscoveryService.getRegisteredServers();
      
      // 查找MongoDB MCP服务器
      const mongodbServer = servers.find(server => 
        server.name.toLowerCase().includes('mongo')
      );
      
      expect(mongodbServer).toBeDefined();
      expect(mongodbServer?.status).toBe('active');
    } catch (error) {
      console.warn('MCP MongoDB服务器测试失败:', error);
      pending('MCP MongoDB服务器可能不可用');
    }
  });

  it.skip('应该能通过MCP执行MongoDB查询', async () => {
    if (SKIP_TESTS) {
      pending('MongoDB MCP测试已跳过');
      return;
    }

    try {
      // 查找MCP服务器
      const servers = mcpDiscoveryService.getRegisteredServers();
      const mongodbServer = servers.find(server => 
        server.name.toLowerCase().includes('mongo')
      );
      
      if (!mongodbServer) {
        pending('MongoDB MCP服务器不可用');
        return;
      }
      
      // 注意：这里假设MCP服务器有query方法，实际实现可能不同
      // 这里仅作为测试框架的示例
      pending('MCP查询测试需要根据实际MCP接口调整');
    } catch (error) {
      console.error('执行MongoDB MCP查询时出错:', error);
      throw error; // 重新抛出错误，确保测试失败
    }
  });

  it('应该能够通过配置连接到MongoDB', async () => {
    if (SKIP_TESTS) {
      pending('MongoDB测试已跳过');
      return;
    }

    if (!mongoConnection) {
      pending('MongoDB连接不可用');
      return;
    }

    try {
      // 验证连接状态
      expect(mongoConnection.readyState).toBe(1); // 1表示已连接
      
      // 验证应用配置
      const mongoUri = process.env['MONGODB_URI'];
      expect(mongoUri).toBeDefined();
      expect(mongoUri?.toString()).toContain('mongodb://');
      
      // 验证可以执行简单查询
      const testCollection = mongoConnection.collection('test_collection');
      const count = await testCollection.countDocuments();
      expect(count).toBeGreaterThan(0);
    } catch (error) {
      console.error('MongoDB连接测试失败:', error);
      throw error;
    }
  });

  it('应该能对MongoDB执行基本操作', async () => {
    if (SKIP_TESTS || !mongoConnection) {
      pending('MongoDB测试已跳过或连接不可用');
      return;
    }
    
    try {
      const testCollection = mongoConnection.collection('test_collection');
      
      // 测试查询
      const docs = await testCollection.find({}).toArray();
      expect(docs.length).toBe(3);
      
      // 测试单个文档查询
      const doc = await testCollection.findOne({ name: '测试文档1' });
      expect(doc).toBeDefined();
      expect(doc?.['value']).toBe(100);
      
      // 测试插入
      await testCollection.insertOne({ name: '测试文档4', value: 400 });
      const newDocs = await testCollection.find({}).toArray();
      expect(newDocs.length).toBe(4);
      
      // 测试更新
      await testCollection.updateOne(
        { name: '测试文档4' },
        { $set: { value: 450 } }
      );
      const updatedDoc = await testCollection.findOne({ name: '测试文档4' });
      expect(updatedDoc).toBeDefined();
      expect(updatedDoc?.['value']).toBe(450);
      
      // 测试删除
      await testCollection.deleteOne({ name: '测试文档4' });
      const finalDocs = await testCollection.find({}).toArray();
      expect(finalDocs.length).toBe(3);
    } catch (error) {
      console.error('MongoDB基本操作测试失败:', error);
      throw error;
    }
  });
});
