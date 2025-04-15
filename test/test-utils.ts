import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection } from 'mongoose';
import { AppModule } from '../src/app.module';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { configuration } from '../src/config/configuration';

export class TestUtils {
  
  /**
   * 创建测试应用实例
   */
  static async createTestingApp(): Promise<INestApplication> {
    // 内存MongoDB配置，在安装mongodb-memory-server依赖后取消注释
    // this.mongoServer = await MongoMemoryServer.create();
    // const mongoUri = this.mongoServer.getUri();
    // process.env["MONGODB_URI"] = mongoUri;
    
    // 临时使用测试数据库
    process.env["MONGODB_URI"] = "mongodb://localhost:27017/cline-chat-test";
    
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
        AppModule,
      ],
    }).compile();

    const app = moduleFixture.createNestApplication();
    await app.init();
    
    return app;
  }
  
  /**
   * 清理测试资源
   */
  static async closeTestingApp(app: INestApplication): Promise<void> {
    try {
      // 尝试获取连接，如果失败则忽略这一步
      const connection = app.get(Connection, { strict: false });
      if (connection) {
        await connection.close();
      }
    } catch (error) {
      console.log('无MongoDB连接需要关闭或连接关闭失败');
    }
    
    // if (this.mongoServer) {
    //   await this.mongoServer.stop();
    // }
    
    await app.close();
  }
  
  /**
   * 模拟深度学习API响应
   */
  static mockDeepseekResponse(status = 200, data: any = {}): any {
    return {
      status,
      data: {
        id: 'chat-test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '这是一个测试回复',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
        ...data,
      },
    };
  }

  /**
   * 创建认证用户并获取JWT令牌
   */
  static async getAuthToken(app: INestApplication): Promise<string> {
    // 这里应该实现认证逻辑，根据项目的实际认证方式
    // 简单示例：
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'test', password: 'test' });
    
    return response.body.token;
  }
}
