/**
 * App — main controller that wires up SSE events, controls, and UI
 */
const App = (() => {

  /* ── State ────────────────────────────────────────────────── */
  let prevBalances  = {};   // agentId → last known balance (for delta animation)
  let elapsedTimer  = null;
  let sessionStart  = null;
  let running       = false;

  /* ── Helpers ──────────────────────────────────────────────── */
  async function api(path, method = 'GET', body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(r => r.json());
  }

  function setRunningUI(isRunning) {
    running = isRunning;
    document.getElementById('startBtn').disabled = isRunning;
    document.getElementById('stopBtn').disabled  = !isRunning;
  }

  function startElapsed(fromMs = 0) {
    sessionStart = Date.now() - fromMs;
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = setInterval(() => {
      const el = document.getElementById('elapsedTimer');
      if (el) el.textContent = UI.fmtTime(Date.now() - sessionStart);
    }, 1000);
  }

  function stopElapsed() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function setRound(n) {
    const el = document.getElementById('roundCounter');
    if (el) el.textContent = n ?? '—';
  }

  function setAgentCountBadge(agents) {
    const active = agents.filter(a => a.isActive).length;
    const el = document.getElementById('agentCountBadge');
    if (el) el.textContent = `${active}/${agents.length} active`;
  }

  function clearGrid() {
    const grid = document.getElementById('agentsGrid');
    grid.innerHTML = `
      <div class="empty-state" id="emptyState">
        <div class="empty-icon" style="animation:spin 1.2s linear infinite">⚙️</div>
        <div class="empty-title">Initialising agents...</div>
      </div>
    `;
    ChartManager.destroyAll();
    prevBalances = {};
  }

  function clearFeedPlaceholder() {
    const feed = document.getElementById('eventFeed');
    const ph   = feed?.querySelector('.feed-placeholder');
    if (ph) ph.remove();
  }

  /* ── Start / Stop handlers ───────────────────────────────── */
  async function handleStart() {
    const agentCount     = parseInt(document.getElementById('agentsCount').value)  || 3;
    const initialBalance = parseInt(document.getElementById('initialBalance').value) || 1000;
    const openRouterKey  = document.getElementById('apiKey').value.trim();

    setRunningUI(true);
    clearGrid();

    // Clear feed
    const feed = document.getElementById('eventFeed');
    if (feed) feed.innerHTML = '';

    try {
      const resp = await api('/api/start', 'POST', { agentCount, initialBalance, openRouterKey });

      if (resp.error) {
        alert('Error: ' + resp.error);
        setRunningUI(false);
        return;
      }

      startElapsed();
      UI.addFeedEvent({ type: 'info', message: 'Session started' });

    } catch (e) {
      alert('Could not reach server: ' + e.message);
      setRunningUI(false);
    }
  }

  async function handleStop() {
    await api('/api/stop', 'POST');
    // UI will update via SSE coordinator:stopped event
  }

  /* ── SSE event handlers ──────────────────────────────────── */
  function onConnected(status) {
    UI.setStatus(status.isRunning, status.demoMode);
    setRunningUI(status.isRunning);

    if (status.isRunning) {
      setRound(status.round);
      startElapsed(status.elapsedMs || 0);

      // Rebuild cards from existing state
      if (status.agents?.length > 0) {
        const grid = document.getElementById('agentsGrid');
        grid.innerHTML = '';

        status.agents.forEach((stats, i) => {
          const card = UI.createAgentCard(stats);
          grid.appendChild(card);
          prevBalances[stats.agentId] = stats.currentBalance;
          ChartManager.create(`chart-${stats.agentId}`, i, stats.startBalance);
          (stats.balanceHistory || []).forEach(b => ChartManager.push(`chart-${stats.agentId}`, b));
        });

        UI.updateAggBar(status.agents);
        setAgentCountBadge(status.agents);
        document.getElementById('aggregateBar').style.display = 'flex';
      }
    }
  }

  function onCoordinatorInitialized(data) {
    UI.setStatus(true, data.demoMode);
    UI.addFeedEvent({
      type: 'info',
      message: `System ready — ${data.demoMode ? '⚡ Demo mode' : '🎰 Live mode'} · ${data.agentCount} agents`
    });
    document.getElementById('aggregateBar').style.display = 'flex';
  }

  function onCoordinatorStopped(data) {
    UI.setStatus(false, false);
    setRunningUI(false);
    stopElapsed();
    UI.addFeedEvent({ type: 'info', message: `Session complete after ${data.round} rounds` });
  }

  function onAgentInitialized(data) {
    // Remove empty state / spinner
    const empty = document.getElementById('emptyState');
    if (empty) empty.remove();

    const grid  = document.getElementById('agentsGrid');
    const stats = {
      agentId: data.agentId,
      startBalance: data.startBalance || data.balance,
      currentBalance: data.balance,
      netProfit: 0, roi: '0.0%',
      totalGames: 0, wins: 0, losses: 0, winRate: '0.0%',
      totalBet: 0, isActive: true
    };

    const card  = UI.createAgentCard(stats);
    grid.appendChild(card);
    prevBalances[data.agentId] = data.balance;

    const idx = parseInt(data.agentId.replace('agent_', '')) - 1;
    ChartManager.create(`chart-${data.agentId}`, idx, data.balance);

    UI.addFeedEvent({
      type: 'info',
      message: `${data.agentId} initialised with ${UI.fmt(data.balance)}`
    });
  }

  function onAgentThinking(data) {
    UI.setThinking(data.agentId);
  }

  function onAgentResult(data) {
    const prev = prevBalances[data.agentId];
    prevBalances[data.agentId] = data.newBalance;

    UI.updateAgentCard(data.stats, prev);
    ChartManager.push(`chart-${data.agentId}`, data.newBalance);

    UI.addFeedEvent({
      type: 'result',
      agentId: data.agentId,
      game: data.game,
      betAmount: data.betAmount,
      won: data.won,
      payout: data.payout,
      reasoning: data.reasoning
    });
  }

  function onAgentStopped(data) {
    UI.updateAgentCard(data.stats, prevBalances[data.agentId]);
    UI.addFeedEvent({ type: 'stop', agentId: data.agentId, reason: data.reason });
  }

  function onStatsUpdate(data) {
    const { agents } = data;
    UI.updateAggBar(agents);
    setAgentCountBadge(agents);
  }

  function onRoundStarted(data) {
    setRound(data.round);
  }

  function onSessionComplete(data) {
    UI.showModal(data);
  }

  /* ── Init ───────────────────────────────────────────────── */
  function init() {
    // Button events
    document.getElementById('startBtn').addEventListener('click', handleStart);
    document.getElementById('stopBtn').addEventListener('click', handleStop);

    document.getElementById('closeModal').addEventListener('click', UI.hideModal);
    document.getElementById('analysisModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) UI.hideModal();
    });

    document.getElementById('clearFeed').addEventListener('click', () => {
      const feed = document.getElementById('eventFeed');
      if (feed) feed.innerHTML = '<div class="feed-placeholder">Waiting for events...</div>';
    });

    // Load saved config
    api('/api/config').then(cfg => {
      if (cfg.agentsCount)    document.getElementById('agentsCount').value    = cfg.agentsCount;
      if (cfg.initialBalance) document.getElementById('initialBalance').value = cfg.initialBalance;
    }).catch(() => {});

    // SSE
    SSEClient
      .on('connected',              onConnected)
      .on('coordinator:initialized', onCoordinatorInitialized)
      .on('coordinator:stopped',     onCoordinatorStopped)
      .on('agent:initialized',       onAgentInitialized)
      .on('agent:thinking',          onAgentThinking)
      .on('agent:result',            onAgentResult)
      .on('agent:stopped',           onAgentStopped)
      .on('stats:update',            onStatsUpdate)
      .on('round:started',           onRoundStarted)
      .on('session:complete',        onSessionComplete)
      .connect();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
