/**
 * In-memory data store — same API as the SQLite version.
 * No native compilation needed, works everywhere.
 * Data resets on server restart (use a hosted DB for persistence later).
 */

const sessions   = [];
const agentMap   = {}; // sessionKey -> { agentId -> state }
const bets       = [];

function nowISO() { return new Date().toISOString(); }

export const stmts = {

  createSession: {
    run({ session_key, started_at }) {
      sessions.unshift({ id: sessions.length + 1, session_key, started_at, ended_at: null, status: 'running', winner_id: null });
    }
  },

  endSession: {
    run({ session_key, ended_at, status, winner_id }) {
      const s = sessions.find(s => s.session_key === session_key);
      if (s) { s.ended_at = ended_at; s.status = status; s.winner_id = winner_id; }
    }
  },

  upsertAgent: {
    run({ session_key, agent_id, balance, wins, losses, total_bet, biggest_win, updated_at }) {
      if (!agentMap[session_key]) agentMap[session_key] = {};
      agentMap[session_key][agent_id] = { session_key, agent_id, balance, wins, losses, total_bet, biggest_win, updated_at };
    }
  },

  insertBet: {
    run({ session_key, agent_id, game, bet_amount, outcome, profit, multiplier, tx_id, placed_at }) {
      bets.unshift({ id: bets.length + 1, session_key, agent_id, game, bet_amount, outcome, profit, multiplier, tx_id, placed_at });
      if (bets.length > 5000) bets.pop(); // cap memory usage
    }
  },

  getSessions: {
    all() { return sessions.slice(0, 50); }
  },

  getSessionBets: {
    all({ session_key }) {
      return bets.filter(b => b.session_key === session_key).slice(0, 200);
    }
  },

  getAllTimeBest: {
    all() {
      const map = {};
      for (const b of bets) {
        if (!map[b.agent_id]) map[b.agent_id] = { agent_id: b.agent_id, best_win: 0, total_wagered: 0, total_wins: 0, total_bets: 0 };
        const m = map[b.agent_id];
        if (b.profit > m.best_win) m.best_win = b.profit;
        m.total_wagered += b.bet_amount;
        m.total_bets++;
        if (b.outcome === 'win') m.total_wins++;
      }
      return Object.values(map);
    }
  },
};

export default stmts;
