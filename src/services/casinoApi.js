import axios from 'axios';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';

class CasinoApiClient {
  constructor() {
    this.baseUrl = config.casino.apiUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Create a new player account
   * @param {string} playerId - Unique identifier for the player
   * @returns {Promise<Object>} Account details
   */
  async createAccount(playerId) {
    try {
      const response = await this.client.post('/account/create', {
        playerId,
        initialBalance: config.casino.initialBalance
      });
      logger.info(`Account created for ${playerId}`, { balance: response.data.balance });
      return response.data;
    } catch (error) {
      logger.error(`Failed to create account for ${playerId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get player's current balance
   * @param {string} playerId - Player identifier
   * @returns {Promise<number>} Current balance
   */
  async getBalance(playerId) {
    try {
      const response = await this.client.get(`/account/${playerId}/balance`);
      return response.data.balance;
    } catch (error) {
      logger.error(`Failed to get balance for ${playerId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get available games
   * @returns {Promise<Array>} List of available games
   */
  async getAvailableGames() {
    try {
      const response = await this.client.get('/games');
      return response.data.games;
    } catch (error) {
      logger.error('Failed to fetch available games', { error: error.message });
      throw error;
    }
  }

  /**
   * Place a bet on a specific game
   * @param {string} playerId - Player identifier
   * @param {string} gameId - Game identifier
   * @param {number} betAmount - Amount to bet
   * @param {Object} gameOptions - Game-specific options (e.g., bet on red/black for roulette)
   * @returns {Promise<Object>} Game result
   */
  async placeBet(playerId, gameId, betAmount, gameOptions = {}) {
    try {
      const response = await this.client.post('/game/play', {
        playerId,
        gameId,
        betAmount,
        options: gameOptions
      });
      
      const result = response.data;
      const outcome = result.won ? 'WON' : 'LOST';
      const netChange = result.won ? result.payout - betAmount : -betAmount;
      
      logger.info(`${playerId} ${outcome} at ${gameId}`, {
        bet: betAmount,
        payout: result.payout,
        netChange,
        newBalance: result.newBalance
      });
      
      return result;
    } catch (error) {
      logger.error(`Failed to place bet for ${playerId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get player's game history
   * @param {string} playerId - Player identifier
   * @param {number} limit - Number of recent games to retrieve
   * @returns {Promise<Array>} Game history
   */
  async getGameHistory(playerId, limit = 10) {
    try {
      const response = await this.client.get(`/account/${playerId}/history`, {
        params: { limit }
      });
      return response.data.history;
    } catch (error) {
      logger.error(`Failed to get game history for ${playerId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get player statistics
   * @param {string} playerId - Player identifier
   * @returns {Promise<Object>} Player statistics
   */
  async getPlayerStats(playerId) {
    try {
      const response = await this.client.get(`/account/${playerId}/stats`);
      return response.data.stats;
    } catch (error) {
      logger.error(`Failed to get stats for ${playerId}`, { error: error.message });
      throw error;
    }
  }
}

export default new CasinoApiClient();
