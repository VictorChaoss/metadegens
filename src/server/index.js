import express        from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import GameCoordinator from '../services/gameCoordinator.js';
import logger          from '../utils/logger.js';
import { config }      from '../config/config.js';
import { stmts }       from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'metadegen';

const app = express();
app.use(express.json());

// ── Static files ──────────────────────────────────────────────────────────────
const dashboardPath = join(__dirname, '../../dashboard');
app.use(express.static(dashboardPath));

// ── SSE client registry ───────────────────────────────────────────────────────
const sseClients = new Set();
let   viewerCount = 0;

function broadcast(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(message); } catch { sseClients.delete(client); }
  }
}

function broadcastViewers() {
  broadcast('viewers', { count: viewerCount });
}

// ── Admin auth middleware ──────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key === ADMIN_PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Session management ────────────────────────────────────────────────────────
let coordinator    = new GameCoordinator();
let gameLoopPromise = null;
let currentSessionKey = null;
let autoRestartTimer  = null;
let isAutoRunning     = false;
let sessionCount      = 0;
let countdown         = 0;
let countdownInterval = null;

const SSE_EVENTS = [
  'coordinator:initialized', 'coordinator:stopped',
  'agent:initialized', 'agent:thinking', 'agent:result', 'agent:stopped',
  'round:started', 'round:complete',
  'stats:update', 'loop:started', 'session:complete'
];

function wireEvents(coord) {
  SSE_EVENTS.forEach(event => {
    coord.on(event, data => {
      // Persist agent state on result
      if (event === 'agent:result' && currentSessionKey) {
        try {
          stmts.upsertAgent.run({
            session_key: currentSessionKey,
            agent_id:    data.agentId  || data.id || '',
            balance:     data.balance  || 0,
            wins:        data.wins     || 0,
            losses:      data.losses   || 0,
            total_bet:   data.totalBet || 0,
            biggest_win: data.biggestWin || 0,
            updated_at:  new Date().toISOString(),
          });

          stmts.insertBet.run({
            session_key: currentSessionKey,
            agent_id:    data.agentId  || data.id || '',
            game:        data.game     || '',
            bet_amount:  data.bet      || 0,
            outcome:     data.outcome  || '',
            profit:      data.profit   || 0,
            multiplier:  data.mult     || 1,
            tx_id:       data.txId     || null,
            placed_at:   new Date().toISOString(),
          });
        } catch (e) {
          logger.warn('DB write error', { error: e.message });
        }
      }

      // Handle session complete → schedule auto-restart
      if (event === 'session:complete') {
        _onSessionComplete(data);
      }

      broadcast(event, data);
    });
  });
}

wireEvents(coordinator);

function _genSessionKey() {
  return 'SID-' + Math.random().toString(36).slice(2,6).toUpperCase()
         + '-' + Date.now().toString(36).slice(-4).toUpperCase();
}

async function _startSession(opts = {}) {
  clearTimeout(autoRestartTimer);
  clearInterval(countdownInterval);

  if (coordinator.isRunning) {
    coordinator.stop();
    await new Promise(r => setTimeout(r, 500));
  }

  coordinator.removeAllListeners();
  coordinator.reset();
  wireEvents(coordinator);

  currentSessionKey = _genSessionKey();
  sessionCount++;

  // Persist session start
  try {
    stmts.createSession.run({
      session_key: currentSessionKey,
      started_at:  new Date().toISOString(),
    });
  } catch (e) { logger.warn('DB session create error', { error: e.message }); }

  // Apply config overrides
  if (opts.initialBalance) config.casino.initialBalance = parseInt(opts.initialBalance);

  const count = opts.agentCount ? parseInt(opts.agentCount) : 6;
  const ok = await coordinator.initialize(count);
  if (!ok) throw new Error('Failed to initialize agents');

  broadcast('session:started', {
    sessionKey: currentSessionKey,
    sessionCount,
    timestamp: new Date().toISOString(),
  });

  // Run in background
  gameLoopPromise = coordinator.runGameLoop().catch(err => {
    logger.error('Game loop error', { error: err.message });
  });

  logger.info(`▶  Session ${currentSessionKey} started (session #${sessionCount})`);
}

function _onSessionComplete(data) {
  // Save winner to DB
  try {
    const agents = coordinator.getStatus().agents || [];
    const winner = agents.sort((a,b) => b.balance - a.balance)[0];
    stmts.endSession.run({
      session_key: currentSessionKey,
      ended_at:    new Date().toISOString(),
      status:      'complete',
      winner_id:   winner?.id || null,
    });
  } catch (e) { logger.warn('DB session end error', { error: e.message }); }

  if (!isAutoRunning) return;

  // 60-second countdown before next session
  countdown = 60;
  broadcast('session:countdown', { seconds: countdown });

  countdownInterval = setInterval(() => {
    countdown--;
    broadcast('session:countdown', { seconds: countdown });
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      _startSession().catch(err => logger.error('Auto-restart error', { error: err.message }));
    }
  }, 1000);
}

// ── Auto-start on server boot ─────────────────────────────────────────────────
async function autoStart() {
  isAutoRunning = true;
  try {
    await _startSession();
    logger.info('🤖  Auto-start: simulation running');
  } catch (err) {
    logger.error('Auto-start failed', { error: err.message });
  }
}

// ── SSE endpoint (public) ─────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send current state immediately
  res.write(`event: connected\ndata: ${JSON.stringify({
    ...coordinator.getStatus(),
    sessionKey:   currentSessionKey,
    sessionCount,
    viewerCount,
    countdown,
  })}\n\n`);

  sseClients.add(res);
  viewerCount++;
  broadcastViewers();

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { /* gone */ }
  }, 20000);

  req.on('close', () => {
    sseClients.delete(res);
    clearInterval(heartbeat);
    viewerCount = Math.max(0, viewerCount - 1);
    broadcastViewers();
  });
});

// ── Public read-only API ──────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    ...coordinator.getStatus(),
    sessionKey:   currentSessionKey,
    sessionCount,
    viewerCount,
    countdown,
  });
});

app.get('/api/history', (req, res) => {
  try {
    const sessions = stmts.getSessions.all();
    res.json({ sessions });
  } catch (e) {
    res.json({ sessions: [] });
  }
});

app.get('/api/alltime', (req, res) => {
  try {
    const stats = stmts.getAllTimeBest.all();
    res.json({ stats });
  } catch (e) {
    res.json({ stats: [] });
  }
});

// ── Admin-only API (requires password) ───────────────────────────────────────
app.post('/api/admin/start', adminAuth, async (req, res) => {
  try {
    isAutoRunning = true;
    await _startSession(req.body || {});
    res.json({ success: true, sessionKey: currentSessionKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/stop', adminAuth, (req, res) => {
  isAutoRunning = false;
  clearTimeout(autoRestartTimer);
  clearInterval(countdownInterval);
  coordinator.stop();
  broadcast('admin:stopped', { message: 'Session stopped by admin' });
  res.json({ success: true });
});

app.post('/api/admin/reset', adminAuth, async (req, res) => {
  try {
    isAutoRunning = true;
    coordinator.stop();
    await new Promise(r => setTimeout(r, 600));
    await _startSession(req.body || {});
    res.json({ success: true, sessionKey: currentSessionKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/sessions', adminAuth, (req, res) => {
  try {
    const sessions = stmts.getSessions.all();
    res.json({ sessions });
  } catch (e) {
    res.json({ sessions: [] });
  }
});

app.get('/api/admin/bets/:sessionKey', adminAuth, (req, res) => {
  try {
    const bets = stmts.getSessionBets.all({ session_key: req.params.sessionKey });
    res.json({ bets });
  } catch (e) {
    res.json({ bets: [] });
  }
});

app.get('/api/admin/verify', adminAuth, (req, res) => {
  res.json({ ok: true, sessionKey: currentSessionKey, sessionCount, viewerCount });
});

// ── Route: admin panel ────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(join(dashboardPath, 'admin.html'));
});

// ── Catch-all → public viewer ─────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(dashboardPath, 'index.html'));
});

// ── Boot ──────────────────────────────────────────────────────────────────────
export function startServer() {
  const port = process.env.PORT || config.server?.port || 3000;
  app.listen(port, () => {
    logger.info(`🎰  Metadegens Arena  →  http://localhost:${port}`);
    logger.info(`🔐  Admin panel       →  http://localhost:${port}/admin`);
    // Auto-start the simulation immediately
    setTimeout(autoStart, 1000);
  });
}

export default app;
