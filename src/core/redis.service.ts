import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client;

  constructor(private configService: ConfigService) {
    const redisConfig = {
      url: configService.get('redis.url') || 'redis://localhost:6379',
      password: configService.get('redis.password') || '',
      socket: {
        connectTimeout: 5000,
        tls: configService.get('redis.tls') || false
      }
    };
    
    this.client = createClient(redisConfig);
    this.client.on('error', (err) => 
      console.error('Redis Client Error:', err));
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async setEx(key: string, ttl: number, value: string): Promise<void> {
    await this.client.setEx(key, ttl, value);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }
}
