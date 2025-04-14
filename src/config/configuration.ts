export default () => ({
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    apiBase: process.env.DEEPSEEK_API_BASE,
    model: process.env.DEEPSEEK_MODEL,
  },
  configPath: process.env.CONFIG_PATH || 'config'
}); 