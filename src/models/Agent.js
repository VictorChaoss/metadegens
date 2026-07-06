import realCasinoApi from '../services/casinoApi.js';
import realLlmService from '../services/llmService.js';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';

class Agent {
  constructor(id, { casinoApi, llmService } = {}) {
    this.id = 'agent_' + id;
    this.balance = config.casino.initialBalance;
    this.startBalance = config.casino.initialBalance;
    this.gameHistory = [];
    this.wins = 0;
    this.losses = 0;
    this.totalBet = 0;
    this.totalWon = 0;
    this.isActive = false;
    this.lastDecision = null;
    this.currentGame = null;

    // Support dependency injection for mock mode
    this.casinoApi = casinoApi || realCasinoApi;
    this.llmService = llmService || realLlmService;
  }

  async initialize() {
    try {
      const account = await this.casinoApi.createAccount(this.id);
      this.balance = account.balance;
      this.startBalance = account.balance;
      this.isActive = true;
      logger.info('Agent initialized: ' + this.id, { balance: this.balance });
      return true;
    } catch (error) {
      logger.error('Failed to initialize agent: ' + this.id, { error: error.message });
      return false;
    }
  }

  async playRound(availableGames) {
    if (!this.isActive) return null;

    try {
      this.balance = await this.casinoApi.getBalance(this.id);

      if (this.balance <= 0) {
        logger.warn(this.id + ' is out of funds', { balance: this.balance });
        this.isActive = false;
        return null;
      }

      const decision = await this.llmService.getGameDecision({
        playerId: this.id,
        balance: this.balance,
        availableGames,
        recentHistory: this.gameHistory
      });

      this.lastDecision = decision;

      if (decision.action === 'stop') {
        logger.info(this.id + ' decided to stop', { reasoning: decision.reasoning });
        this.isActive = false;
        return { stopped: true, reasoning: decision.reasoning };
      }

      if (decision.action === 'play') {
        this.currentGame = decision.gameId;
        const betAmount = Math.min(decision.betAmount, this.balance);

        if (betAmount <= 0) {
          logger.warn(this.id + ' attempted invalid bet', { betAmount });
          this.isActive = false;
          return null;
        }

        const result = await this.casinoApi.placeBet(
          this.id,
          decision.gameId,
          betAmount,
          decision.gameOptions || {}
        );

        this.gameHistory.push({
          game: decision.gameId,
          bet: betAmount,
          won: result.won,
          payout: result.payout,
          balance: result.newBalance,
          reasoning: decision.reasoning,
          timestamp: new Date().toISOString()
        });

        this.balance = result.newBalance;
        this.totalBet += betAmount;

        if (result.won) {
          this.wins++;
          this.totalWon += result.payout;
        } else {
          this.losses++;
        }

        return {
          ...result,
          betAmount,
          game: decision.gameId,
          reasoning: decision.reasoning
        };
      }

      return null;
    } catch (error) {
      logger.error('Error during ' + this.id + ' play round', { error: error.message });
      return null;
    }
  }

  getStats() {
    const totalGames = this.wins + this.losses;
    const winRate = totalGames > 0 ? ((this.wins / totalGames) * 100).toFixed(1) : '0.0';
    const netProfit = this.balance - this.startBalance;
    const roi = this.startBalance > 0 ? ((netProfit / this.startBalance) * 100).toFixed(1) : '0.0';

    return {
      agentId: this.id,
      startBalance: this.startBalance,
      currentBalance: this.balance,
      netProfit,
      roi: roi + '%',
      totalGames,
      wins: this.wins,
      losses: this.losses,
      winRate: winRate + '%',
      totalBet: this.totalBet,
      totalWon: this.totalWon,
      isActive: this.isActive,
      lastDecision: this.lastDecision,
      currentGame: this.currentGame,
      balanceHistory: this.gameHistory.map(h => h.balance)
    };
  }

  async getSessionAnalysis() {
    try {
      const stats = this.getStats();
      return await this.llmService.analyzeSession({
        playerId: this.id,
        startBalance: this.startBalance,
        endBalance: this.balance,
        totalGames: stats.totalGames,
        wins: this.wins,
        losses: this.losses
      });
    } catch (error) {
      logger.error('Failed to get session analysis for ' + this.id, { error: error.message });
      return 'Analysis unavailable';
    }
  }
}

export default Agent;
