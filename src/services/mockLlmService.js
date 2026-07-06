import { config } from '../config/config.js';

const REASONINGS = [
  'Blackjack offers the best mathematical odds. Going in conservatively.',
  'After those losses, roulette red/black gives me a shot to recover.',
  'Balance is healthy — pressing with slots for high-variance upside.',
  'Protecting my stack with a small bet to stay in the game.',
  'Win rate is above baseline. Scaling up my position on blackjack.',
  'Slots have been cold. Switching to roulette for better odds.',
  'Conservative sizing while I reassess my strategy.',
  'Risk-adjusted play: moderate bet relative to current bankroll.',
  'Running hot — riding momentum with a larger stake on roulette.',
  'Cutting exposure after recent losses. Minimum bet to stay active.',
  'Diversifying game selection to break this losing streak.',
  'Mathematical expectation favours blackjack here. Taking position.',
  'Low balance — making a calculated high-risk bet to recover.',
  'Strong session so far. Locking in profit with a conservative play.',
  'Variance play on slots — small downside, big upside potential.',
];

const ANALYSIS_TEMPLATES = [
  (d) => `${d.playerId} finished with a ${d.wins}W / ${d.losses}L record across ${d.totalGames} games. ${d.endBalance > d.startBalance ? `Net gain of $${(d.endBalance - d.startBalance).toFixed(2)} reflects disciplined bet sizing and good variance management.` : `Despite a net loss of $${(d.startBalance - d.endBalance).toFixed(2)}, the session showed strategic adaptation throughout.`}`,
  (d) => `Session report: ${((d.wins / Math.max(d.totalGames, 1)) * 100).toFixed(1)}% win rate ${d.wins / Math.max(d.totalGames, 1) > 0.48 ? 'above' : 'below'} expected baseline. ${d.endBalance > d.startBalance ? 'Profitable outcome — well-executed strategy.' : 'Negative EV result, within acceptable variance range.'}`,
  (d) => `${d.playerId} played ${d.totalGames} rounds with net ${d.endBalance >= d.startBalance ? 'profit' : 'loss'} of $${Math.abs(d.endBalance - d.startBalance).toFixed(2)}. Win rate of ${((d.wins / Math.max(d.totalGames, 1)) * 100).toFixed(0)}% ${d.wins / Math.max(d.totalGames, 1) > 0.5 ? 'exceeded' : 'fell short of'} the 50% benchmark.`,
];

class MockLLMService {
  async getGameDecision({ playerId, balance, availableGames, recentHistory }) {
    // Simulate AI latency
    await new Promise(r => setTimeout(r, 200 + Math.random() * 400));

    if (balance < 5) {
      return {
        action: 'stop',
        reasoning: 'Balance critically low. Preserving remaining funds.',
        gameId: null,
        betAmount: 0
      };
    }

    // Small chance to cash out voluntarily when profitable
    const initialBalance = config.casino.initialBalance;
    if (balance > initialBalance * 1.6 && Math.random() < 0.03) {
      return {
        action: 'stop',
        reasoning: 'Profit target exceeded. Locking in gains and exiting.',
        gameId: null,
        betAmount: 0
      };
    }

    const game = availableGames[Math.floor(Math.random() * availableGames.length)];

    // Adaptive bet sizing based on recent performance
    const recentWins = (recentHistory || []).slice(-3).filter(h => h.won).length;
    const aggression = 0.04 + (recentWins / 3) * 0.18; // 4%–22% of balance
    const betAmount = Math.max(
      game.minBet || 5,
      Math.min(balance * 0.4, Math.floor(balance * aggression))
    );

    return {
      action: 'play',
      gameId: game.id,
      betAmount: Math.floor(betAmount),
      reasoning: REASONINGS[Math.floor(Math.random() * REASONINGS.length)]
    };
  }

  async analyzeSession(data) {
    await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
    const template = ANALYSIS_TEMPLATES[Math.floor(Math.random() * ANALYSIS_TEMPLATES.length)];
    return template(data);
  }
}

export default new MockLLMService();
