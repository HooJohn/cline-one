import { EventEmitter } from 'events';
import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { McpServer, McpServerConfig } from '../../interfaces/mcp-server.interface';
import { ProtocolAdapter } from './protocol-adapters.type';
import { WorkflowTaskDto } from '../../orchestration/dto/workflow-task.dto';

@Injectable()
export class StdioAdapter extends EventEmitter implements ProtocolAdapter {
  private readonly logger = new Logger(StdioAdapter.name);
  private processes = new Map<string, ChildProcess>();

  async discover(config: McpServerConfig): Promise<McpServer | null> {
    try {
      // 添加配置验证逻辑
      if (!config.id) {
        this.logger.error('Missing server ID in config');
        return null;
      }
      
      if (!config.command || !config.args) {
        this.logger.error(`Missing command or args in config for ${config.id}`);
        return null;
      }

      // 添加默认工作目录配置
      config.workingDir = config.workingDir || process.cwd();

      const childProcess = spawn(config.command, config.args, {
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      if (!childProcess.stdin || !childProcess.stdout || !childProcess.stderr) {
        this.logger.error(`Failed to create stdio streams for ${config.id}`);
        return null;
      }

      this.processes.set(config.id, childProcess);

      childProcess.stdout.on('data', (data: Buffer) => {
        this.logger.debug(`[${config.id}] stdout: ${data}`);
      });

      childProcess.stderr.on('data', (data: Buffer) => {
        this.logger.warn(`[${config.id}] stderr: ${data}`);
      });

      childProcess.on('error', (error: Error) => {
        this.logger.error(`[${config.id}] Process error: ${error.message}`);
      });

      childProcess.on('close', (code: number) => {
        this.logger.log(`[${config.id}] Process exited with code ${code}`);
        this.processes.delete(config.id);
      });

      return {
        id: config.id,
        name: config.id,
        protocol: 'stdio',
        version: '1.0.0',
        status: 'connected',
        lastSeen: Date.now(),
        lastHeartbeat: Date.now(),
        capabilities: {
          tools: config.autoApprove || [],
          resources: [],
          resourceTemplates: [],
          includes: (capability: string) => 
            config.autoApprove?.includes(capability) ?? false
        },
        config
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to discover server ${config.id}: ${errorMessage}`);
      return null;
    }
  }

  async checkHeartbeat(server: McpServer): Promise<boolean> {
    const process = this.processes.get(server.id);
    return Boolean(process && !process.killed);
  }

  async executeTask(server: McpServer, task: WorkflowTaskDto): Promise<any> {
    return new Promise((resolve, reject) => {
      const process = this.processes.get(server.id);
      if (!process || !process.stdin || !process.stdout) {
        reject(new Error(`No valid process found for server ${server.id}`));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error(`Task execution timed out after ${task.timeout || 30000}ms`));
      }, task.timeout || 30000);

      process.stdin.write(JSON.stringify(task) + '\n');

      const responseHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.taskId === task.taskId) {
            clearTimeout(timeout);
            process.stdout?.removeListener('data', responseHandler);
            if (response.status === 'completed') {
              resolve(response.result);
            } else {
              reject(new Error(response.error || 'Task execution failed'));
            }
          }
        } catch (error) {
          // 忽略非JSON数据
        }
      };

      process.stdout.on('data', responseHandler);
    });
  }
}
