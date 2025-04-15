import { McpServerConfig } from '../interfaces/mcp-server.interface';

export const mcpServers: McpServerConfig[] = [
  {
    id: 'sequential-thinking',
    protocol: 'stdio',
    disabled: false,
    command: 'node',
    args: ['/Users/mc/.nvm/versions/node/v23.10.0/bin/mcp-server-sequential-thinking'],
    autoApprove: ['sequentialthinking']
  },
  {
    id: 'mongo-mcp',
    protocol: 'stdio',
    disabled: false,
    command: 'npx',
    args: [
      '-y',
      '@smithery/cli@latest',
      'run',
      'mongo-mcp',
      '--config',
      '{"mongoUri":"mongodb://localhost:27017/"}'
    ],
    autoApprove: [
      'listCollections',
      'find',
      'insertOne',
      'updateOne',
      'deleteOne',
      'createIndex',
      'dropIndex',
      'indexes'
    ]
  },
  {
    id: 'llm-worker',
    protocol: 'stdio',
    disabled: false,
    command: 'npx',
    args: [
      '-y',
      '@smithery/cli@latest',
      'run',
      'llm-worker'
    ],
    env: {
      ['DEEPSEEK_API_KEY']: process.env['DEEPSEEK_API_KEY'] || '',
      ['DEEPSEEK_API_BASE']: process.env['DEEPSEEK_API_BASE'] || 'https://api.deepseek.com'
    },
    autoApprove: [
      'llm_completion',
      'analyze'
    ]
  }
]; 