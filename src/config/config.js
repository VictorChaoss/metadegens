import dotenv from 'dotenv';
dotenv.config();

export const config = {
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: process.env.LLM_MODEL || 'anthropic/claude-3.5-sonnet'
  },
  casino: {
    apiUrl: process.env.CASINO_API_URL || 'http://localhost:7777',
    initialBalance: parseInt(process.env.INITIAL_BALANCE) || 1000
  },
  agent: {
    maxRounds: parseInt(process.env.MAX_ROUNDS) || 0,
    agentsCount: parseInt(process.env.AGENTS_COUNT) || 3
  },
  server: {
    port: parseInt(process.env.PORT) || 3000
  }
};
