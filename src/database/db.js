import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const DATA_DIR = join(__dirname, '../../data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'arena.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT    NOT NULL UNIQUE,
    started_at  TEXT    NOT NULL,
    ended_at    TEXT,
    status      TEXT    NOT NULL DEFAULT 'running',
    winner_id   TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_states (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT    NOT NULL,
    agent_id    TEXT    NOT NULL,
    balance     REAL    NOT NULL DEFAULT 1000,
    wins        INTEGER NOT NULL DEFAULT 0,
    losses      INTEGER NOT NULL DEFAULT 0,
    total_bet   REAL    NOT NULL DEFAULT 0,
    biggest_win REAL    NOT NULL DEFAULT 0,
    updated_at  TEXT    NOT NULL,
    UNIQUE(session_key, agent_id)
  );

  CREATE TABLE IF NOT EXISTS bets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT    NOT NULL,
    agent_id    TEXT    NOT NULL,
    game        TEXT    NOT NULL,
    bet_amount  REAL    NOT NULL,
    outcome     TEXT    NOT NULL,
    profit      REAL    NOT NULL,
    multiplier  REAL    NOT NULL DEFAULT 1,
    tx_id       TEXT,
    placed_at   TEXT    NOT NULL
  );
`);

export const stmts = {
  createSession: db.prepare(`
    INSERT INTO sessions (session_key, started_at, status)
    VALUES (@session_key, @started_at, 'running')
  `),
  endSession: db.prepare(`
    UPDATE sessions SET ended_at=@ended_at, status=@status, winner_id=@winner_id
    WHERE session_key=@session_key
  `),
  upsertAgent: db.prepare(`
    INSERT INTO agent_states (session_key,agent_id,balance,wins,losses,total_bet,biggest_win,updated_at)
    VALUES (@session_key,@agent_id,@balance,@wins,@losses,@total_bet,@biggest_win,@updated_at)
    ON CONFLICT(session_key,agent_id) DO UPDATE SET
      balance=@balance, wins=@wins, losses=@losses,
      total_bet=@total_bet, biggest_win=@biggest_win, updated_at=@updated_at
  `),
  insertBet: db.prepare(`
    INSERT INTO bets (session_key,agent_id,game,bet_amount,outcome,profit,multiplier,tx_id,placed_at)
    VALUES (@session_key,@agent_id,@game,@bet_amount,@outcome,@profit,@multiplier,@tx_id,@placed_at)
  `),
  getSessions:     db.prepare(`SELECT * FROM sessions ORDER BY id DESC LIMIT 50`),
  getSessionBets:  db.prepare(`SELECT * FROM bets WHERE session_key=@session_key ORDER BY id DESC LIMIT 200`),
  getAllTimeBest:   db.prepare(`
    SELECT agent_id,
           MAX(profit) as best_win,
           SUM(bet_amount) as total_wagered,
           SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END) as total_wins,
           COUNT(*) as total_bets
    FROM bets GROUP BY agent_id
  `),
};

export default db;
