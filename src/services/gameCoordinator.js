import { EventEmitter } from 'events';
import Agent from '../models/Agent.js';
import realCasinoApi from './casinoApi.js';
import mockCasinoApi from './mockCasinoApi.js';
import realLlmService from './llmService.js';
import mockLlmService from './mockLlmService.js';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';

class GameCoordinator extends EventEmitter {
  constructor() {
    super();
    this.agents = [];
    this.availableGames = [];
    this.isRunning = false;
    this.round = 0;
    this.startTime = null;
    this.demoMode = false;
    this.casinoApi = null;
    this.llmService = null;
  }

  async initialize(agentCount = config.agent.agentsCount) {
    this.round = 0;
    this.agents = [];
    this.startTime = Date.now();

    logger.info('Initializing game coordinator with ' + agentCount + ' agents');

    // Try real casino API, fall back to mock automatically
    try {
      this.availableGames = await realCasinoApi.getAvailableGames();
      this.casinoApi = realCasinoApi;
      this.demoMode = false;
      logger.info('Connected to real casino API');
    } catch (error) {
      logger.warn('Real casino API unavailable — switching to demo mode');
      mockCasinoApi.reset();
      this.availableGames = await mockCasinoApi.getAvailableGames();
      this.casinoApi = mockCasinoApi;
      this.demoMode = true;
    }

    // Use mock LLM if no API key configured
    if (!config.openRouter.apiKey) {
      logger.warn('No OpenRouter API key — using mock LLM');
      this.llmService = mockLlmService;
    } else {
      this.llmService = realLlmService;
    }

    this.emit('coordinator:initialized', {
      demoMode: this.demoMode,
      games: this.availableGames,
      agentCount
    });

    for (let i = 1; i <= agentCount; i++) {
      const agent = new Agent(i, {
        casinoApi: this.casinoApi,
        llmService: this.llmService
      });
      const initialized = await agent.initialize();

      if (initialized) {
        this.agents.push(agent);
        this.emit('agent:initialized', {
          agentId: agent.id,
          balance: agent.balance,
          startBalance: agent.startBalance
        });
      }
    }

    logger.info('Initialized ' + this.agents.length + ' agents successfully');
    return this.agents.length > 0;
  }

  async runGameLoop() {
    if (this.agents.length === 0) {
      logger.error('No agents available to run game loop');
      return;
    }

    this.isRunning = true;
    const maxRounds = config.agent.maxRounds;
    const isInfinite = maxRounds === 0;

    logger.info('Starting game loop', {
      maxRounds: isInfinite ? 'infinite' : maxRounds,
      agents: this.agents.length
    });

    this.emit('loop:started', {
      maxRounds: isInfinite ? 'infinite' : maxRounds,
      agents: this.agents.length
    });

    while (this.isRunning && (isInfinite || this.round < maxRounds)) {
      this.round++;
      const activeAgents = this.agents.filter(a => a.isActive);

      if (activeAgents.length === 0) {
        logger.info('No active agents remaining, ending game loop');
        break;
      }

      this.emit('round:started', { round: this.round, activeAgents: activeAgents.length });

      for (const agent of activeAgents) {
        if (!this.isRunning) break;

        // Signal that this agent is thinking
        this.emit('agent:thinking', { agentId: agent.id, balance: agent.balance });

        const result = await agent.playRound(this.availableGames);

        if (result) {
          if (result.stopped) {
            this.emit('agent:stopped', {
              agentId: agent.id,
              reason: result.reasoning,
              stats: agent.getStats()
            });
          } else {
            this.emit('agent:result', {
              agentId: agent.id,
              game: result.game,
              betAmount: result.betAmount,
              won: result.won,
              payout: result.payout,
              newBalance: result.newBalance,
              reasoning: result.reasoning,
              stats: agent.getStats()
            });
          }
        }

        // Broadcast full stats snapshot after each action
        this.emit('stats:update', { agents: this.agents.map(a => a.getStats()) });

        if (this.isRunning) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }

      this.emit('round:complete', {
        round: this.round,
        agents: this.agents.map(a => a.getStats())
      });

      if (this.round % 10 === 0) {
        this._printIntermediateStats(this.round);
      }
    }

    this.isRunning = false;
    logger.info('Game loop completed');

    const finalData = await this._collectFinalStats();
    this.emit('session:complete', finalData);

    await this._printFinalStats();
  }

  async _collectFinalStats() {
    const allStats = this.agents.map(a => a.getStats());
    const analyses = [];

    for (const agent of this.agents) {
      try {
        const analysis = await agent.getSessionAnalysis();
        analyses.push({ agentId: agent.id, analysis });
      } catch {
        analyses.push({ agentId: agent.id, analysis: 'Analysis unavailable' });
      }
    }

    const totalStartBalance = allStats.reduce((s, a) => s + a.startBalance, 0);
    const totalEndBalance = allStats.reduce((s, a) => s + a.currentBalance, 0);
    const totalGames = allStats.reduce((s, a) => s + a.totalGames, 0);
    const totalWins = allStats.reduce((s, a) => s + a.wins, 0);

    return {
      agents: allStats,
      analyses,
      aggregate: {
        totalStartBalance,
        totalEndBalance,
        totalProfit: totalEndBalance - totalStartBalance,
        totalGames,
        totalWins,
        totalLosses: totalGames - totalWins,
        overallWinRate: totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) + '%' : '0%'
      }
    };
  }

  _printIntermediateStats(round) {
    logger.info('===== Round ' + round + ' Stats =====');
    for (const agent of this.agents) {
      const s = agent.getStats();
      logger.info(s.agentId, {
        balance: '$' + s.currentBalance.toFixed(2),
        profit: '$' + s.netProfit.toFixed(2),
        winRate: s.winRate,
        active: s.isActive
      });
    }
  }

  async _printFinalStats() {
    logger.info('===== FINAL STATISTICS =====');
    for (const agent of this.agents) {
      const s = agent.getStats();
      logger.info('Agent: ' + s.agentId + ' | Balance: $' + s.currentBalance.toFixed(2) + ' | Win Rate: ' + s.winRate);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      round: this.round,
      demoMode: this.demoMode,
      elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
      agents: this.agents.map(a => a.getStats()),
      availableGames: this.availableGames
    };
  }

  stop() {
    this.isRunning = false;
    logger.info('Game coordinator stopped');
    this.emit('coordinator:stopped', { round: this.round });
  }

  reset() {
    this.agents = [];
    this.round = 0;
    this.startTime = null;
    this.isRunning = false;
  }
}

export default GameCoordinator;
