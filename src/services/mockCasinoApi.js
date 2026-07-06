import { config } from '../config/config.js';

const GAMES = [
  { id: 'blackjack', name: 'Blackjack', minBet: 10, winChance: 0.44 },
  { id: 'roulette', name: 'Roulette', minBet: 5, winChance: 0.486 },
  { id: 'slots', name: 'Slots', minBet: 1, winChance: 0.32 }
];

class MockCasinoApiClient {
  constructor() {
    this.accounts = new Map();
    this.histories = new Map();
  }

  async createAccount(playerId) {
    const balance = config.casino.initialBalance;
    this.accounts.set(playerId, balance);
    this.histories.set(playerId, []);
    return { playerId, balance };
  }

  async getBalance(playerId) {
    return this.accounts.get(playerId) ?? config.casino.initialBalance;
  }

  async getAvailableGames() {
    return GAMES;
  }

  async placeBet(playerId, gameId, betAmount) {
    const balance = this.accounts.get(playerId) ?? 0;
    const game = GAMES.find(g => g.id === gameId) || GAMES[0];

    // Slight variance based on recent performance
    const history = this.histories.get(playerId) || [];
    const recentWins = history.slice(-5).filter(h => h.won).length;
    const adjustment = recentWins >= 4 ? -0.04 : recentWins <= 1 ? 0.04 : 0;
    const adjustedChance = Math.max(0.1, Math.min(0.65, game.winChance + adjustment));

    const won = Math.random() < adjustedChance;
    let payout = 0;

    if (won) {
      if (gameId === 'slots') {
        const roll = Math.random();
        if (roll < 0.05) payout = betAmount * 10;       // jackpot
        else if (roll < 0.2) payout = betAmount * 3;
        else payout = betAmount * 2;
      } else {
        payout = betAmount * 2;
      }
    }

    const newBalance = Math.max(0, balance - betAmount + payout);
    this.accounts.set(playerId, newBalance);

    const entry = { gameId, betAmount, won, payout, newBalance, timestamp: new Date().toISOString() };
    history.push(entry);
    this.histories.set(playerId, history);

    return { won, payout, newBalance, game: gameId };
  }

  async getGameHistory(playerId, limit = 10) {
    return (this.histories.get(playerId) || []).slice(-limit);
  }

  async getPlayerStats(playerId) {
    const history = this.histories.get(playerId) || [];
    const wins = history.filter(h => h.won).length;
    return { totalGames: history.length, wins, losses: history.length - wins };
  }

  reset() {
    this.accounts.clear();
    this.histories.clear();
  }
}

export default new MockCasinoApiClient();
