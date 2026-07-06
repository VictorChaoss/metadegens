import axios from 'axios';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';

class LLMService {
  constructor() {
    this.apiKey = config.openRouter.apiKey;
    this.baseUrl = config.openRouter.baseUrl;
    this.model = config.openRouter.model;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Authorization': 'Bearer ' + this.apiKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Casino AI Agent'
      }
    });
  }

  async getGameDecision(context) {
    const { playerId, balance, availableGames, recentHistory } = context;
    
    const gamesListText = availableGames.map(g => g.name + ' (' + g.id + ')').join(', ');
    
    const systemPrompt = 'You are an AI agent playing casino games. You have a current balance of $' + balance + '.\nAvailable games: ' + gamesListText + '.\n\nYour goal is to make strategic decisions about which game to play and how much to bet.\nConsider your current balance, recent performance, and game odds when making decisions.\n\nRespond with a JSON object containing:\n- "action": "play" or "stop" (stop if balance is too low or you want to cash out)\n- "gameId": the game to play (if action is "play")\n- "betAmount": how much to bet (if action is "play")\n- "reasoning": brief explanation of your decision\n\nExample response:\n{\n  "action": "play",\n  "gameId": "blackjack",\n  "betAmount": 50,\n  "reasoning": "Balance is healthy, betting conservatively on blackjack which has better odds"\n}';

    const userPrompt = 'Current balance: $' + balance + '\nRecent games (last 5): ' + JSON.stringify(recentHistory.slice(-5), null, 2) + '\n\nWhat is your next move?';

    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 500
      });

      const content = response.data.choices[0].message.content;
      const decision = JSON.parse(content);
      
      logger.info(playerId + ' AI decision', { decision });
      return decision;
    } catch (error) {
      logger.error('Failed to get AI decision for ' + playerId, { 
        error: error.message,
        response: error.response && error.response.data 
      });
      
      return {
        action: 'stop',
        reasoning: 'Error communicating with AI service'
      };
    }
  }

  async analyzeSession(sessionData) {
    const { playerId, startBalance, endBalance, totalGames, wins, losses } = sessionData;
    
    const prompt = 'Analyze this casino gaming session:\n- Player: ' + playerId + '\n- Starting balance: $' + startBalance + '\n- Ending balance: $' + endBalance + '\n- Total games played: ' + totalGames + '\n- Wins: ' + wins + '\n- Losses: ' + losses + '\n- Net change: $' + (endBalance - startBalance) + '\n\nProvide a brief analysis of the performance and strategy.';

    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('Failed to analyze session for ' + playerId, { error: error.message });
      return 'Analysis unavailable';
    }
  }
}

export default new LLMService();
