/**
 * UI — DOM helpers, card creation/update, feed, modal
 */
const UI = (() => {

  /* ── Constants ──────────────────────────────────────────── */
  const AGENT_COLORS     = ['#00FFB2','#FF3366','#8B5CF6','#F59E0B','#3B9EFF','#FF6B35'];
  const AGENT_COLORS_DIM = [
    'rgba(0,255,178,0.12)','rgba(255,51,102,0.12)','rgba(139,92,246,0.12)',
    'rgba(245,158,11,0.12)','rgba(59,158,255,0.12)','rgba(255,107,53,0.12)'
  ];

  const GAME_ICONS = {
    blackjack: '🃏',
    roulette:  '🎡',
    slots:     '🎰',
  };

  /* ── Helpers ────────────────────────────────────────────── */
  function agentIndex(agentId) {
    return (parseInt(agentId.replace('agent_', '')) - 1) % AGENT_COLORS.length;
  }

  function agentColor(agentId)    { return AGENT_COLORS[agentIndex(agentId)]; }
  function agentColorDim(agentId) { return AGENT_COLORS_DIM[agentIndex(agentId)]; }

  function gameIcon(gameId) { return GAME_ICONS[gameId] || '🎲'; }

  function fmt(val) {
    return '$' + parseFloat(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  function nowTime() { return new Date().toTimeString().slice(0, 8); }

  /* ── Create agent card DOM ──────────────────────────────── */
  function createAgentCard(stats) {
    const {
      agentId, startBalance, currentBalance,
      netProfit, roi, wins, losses, winRate, isActive
    } = stats;

    const color    = agentColor(agentId);
    const colorDim = agentColorDim(agentId);
    const num      = agentId.replace('agent_', '#');
    const chartId  = `chart-${agentId}`;

    const pnlCls = netProfit >= 0 ? 'pos' : 'neg';
    const roiCls = parseFloat(roi) >= 0 ? 'pos' : 'neg';

    const card = document.createElement('div');
    card.className  = 'agent-card' + (isActive ? '' : ' inactive');
    card.id         = `card-${agentId}`;
    card.role       = 'listitem';
    card.style.setProperty('--card-color',     color);
    card.style.setProperty('--card-color-dim', colorDim);

    card.innerHTML = `
      <div class="card-header">
        <div class="card-identity">
          <div class="card-avatar">${num}</div>
          <div class="card-name-wrap">
            <div class="card-agent-id">${agentId}</div>
            <div class="card-status">${isActive ? '● Active' : '○ Stopped'}</div>
          </div>
        </div>
        <div class="card-game-badge" id="game-badge-${agentId}">—</div>
      </div>

      <div class="card-balance-row">
        <div class="card-balance-wrap">
          <div class="balance-lbl">Balance</div>
          <div class="balance-val mono" id="bal-${agentId}">${fmt(currentBalance)}</div>
        </div>
        <div class="balance-delta mono" id="delta-${agentId}"></div>
      </div>

      <div class="card-stats">
        <div class="stat-pill">
          <div class="pill-lbl">P&amp;L</div>
          <div class="pill-val ${pnlCls}" id="pnl-${agentId}">${netProfit >= 0 ? '+' : ''}${fmt(netProfit)}</div>
        </div>
        <div class="stat-pill">
          <div class="pill-lbl">Win Rate</div>
          <div class="pill-val" id="wr-${agentId}">${winRate}</div>
        </div>
        <div class="stat-pill">
          <div class="pill-lbl">ROI</div>
          <div class="pill-val ${roiCls}" id="roi-${agentId}">${roi}</div>
        </div>
      </div>

      <div class="card-stats card-stats-2col">
        <div class="stat-pill">
          <div class="pill-lbl">Wins</div>
          <div class="pill-val pos" id="wins-${agentId}">${wins}</div>
        </div>
        <div class="stat-pill">
          <div class="pill-lbl">Losses</div>
          <div class="pill-val neg" id="losses-${agentId}">${losses}</div>
        </div>
      </div>

      <div class="card-chart-wrap">
        <canvas id="${chartId}"></canvas>
      </div>

      <div class="card-reasoning" id="reasoning-${agentId}">
        <span class="reasoning-icon">🤖</span>
        <span class="reasoning-text">Waiting for decision...</span>
      </div>
    `;

    return card;
  }

  /* ── Update existing agent card ─────────────────────────── */
  function updateAgentCard(stats, prevBalance) {
    const {
      agentId, currentBalance, netProfit, roi,
      wins, losses, winRate, isActive, lastDecision, currentGame
    } = stats;

    const card = document.getElementById(`card-${agentId}`);
    if (!card) return;

    // Active state
    card.classList.toggle('inactive', !isActive);

    // Balance
    const balEl = document.getElementById(`bal-${agentId}`);
    if (balEl) balEl.textContent = fmt(currentBalance);

    // Delta flash
    if (prevBalance !== undefined && prevBalance !== currentBalance) {
      const delta  = currentBalance - prevBalance;
      const deltaEl = document.getElementById(`delta-${agentId}`);

      if (deltaEl) {
        // Reset animation
        deltaEl.className = 'balance-delta mono';
        void deltaEl.offsetWidth; // reflow
        deltaEl.textContent = (delta >= 0 ? '+' : '') + fmt(delta);
        deltaEl.classList.add(delta >= 0 ? 'up' : 'down');
      }

      // Card border flash
      card.classList.remove('flash-win', 'flash-loss');
      void card.offsetWidth;
      card.classList.add(delta >= 0 ? 'flash-win' : 'flash-loss');
    }

    // Stats
    const pnlEl = document.getElementById(`pnl-${agentId}`);
    if (pnlEl) {
      pnlEl.textContent = (netProfit >= 0 ? '+' : '') + fmt(netProfit);
      pnlEl.className   = 'pill-val ' + (netProfit >= 0 ? 'pos' : 'neg');
    }

    const wrEl = document.getElementById(`wr-${agentId}`);
    if (wrEl) wrEl.textContent = winRate;

    const roiEl = document.getElementById(`roi-${agentId}`);
    if (roiEl) {
      roiEl.textContent = roi;
      roiEl.className   = 'pill-val ' + (parseFloat(roi) >= 0 ? 'pos' : 'neg');
    }

    const winsEl = document.getElementById(`wins-${agentId}`);
    if (winsEl) winsEl.textContent = wins;

    const lossesEl = document.getElementById(`losses-${agentId}`);
    if (lossesEl) lossesEl.textContent = losses;

    // Game badge
    const gameEl = document.getElementById(`game-badge-${agentId}`);
    if (gameEl && currentGame) {
      gameEl.textContent = gameIcon(currentGame) + ' ' + currentGame;
    }

    // Status text
    const statusEl = card.querySelector('.card-status');
    if (statusEl) statusEl.textContent = isActive ? '● Active' : '○ Stopped';

    // Reasoning
    const reasonEl = document.getElementById(`reasoning-${agentId}`);
    if (reasonEl && lastDecision?.reasoning) {
      const icon = lastDecision.action === 'stop' ? '🛑' : '🤖';
      reasonEl.innerHTML = `
        <span class="reasoning-icon">${icon}</span>
        <span class="reasoning-text">${lastDecision.reasoning}</span>
      `;
    }
  }

  /* ── Set agent to "thinking" state ──────────────────────── */
  function setThinking(agentId) {
    const el = document.getElementById(`reasoning-${agentId}`);
    if (!el) return;
    el.innerHTML = `
      <span class="reasoning-icon">💭</span>
      <span class="reasoning-text">AI thinking<span class="thinking"></span></span>
    `;
  }

  /* ── Add event to live feed ─────────────────────────────── */
  function addFeedEvent(data) {
    const feed = document.getElementById('eventFeed');
    if (!feed) return;

    // Remove placeholder
    const placeholder = feed.querySelector('.feed-placeholder');
    if (placeholder) placeholder.remove();

    const { type, agentId, game, betAmount, won, payout, reasoning, reason, message } = data;
    const color = agentId ? agentColor(agentId) : 'rgba(255,255,255,0.5)';
    const time  = nowTime();

    const el = document.createElement('div');

    if (type === 'result') {
      const profit = won ? (payout - betAmount) : -betAmount;
      const profitStr = (profit >= 0 ? '+' : '') + fmt(profit);

      el.className = `feed-evt ${won ? 'win' : 'loss'}`;
      el.innerHTML = `
        <div class="evt-top">
          <span class="evt-agent-badge" style="background:${color}1a;color:${color}">${agentId}</span>
          <span class="evt-game">${gameIcon(game)} ${game || '?'}</span>
          <span class="evt-time mono">${time}</span>
        </div>
        <div class="evt-bottom">
          <span class="evt-result ${won ? 'win' : 'loss'}">${profitStr}</span>
          <span class="evt-reason">${reasoning || ''}</span>
        </div>
      `;
    } else if (type === 'stop') {
      el.className = 'feed-evt stop';
      el.innerHTML = `
        <div class="evt-top">
          <span class="evt-agent-badge" style="background:${color}1a;color:${color}">${agentId}</span>
          <span class="evt-game">🛑 Agent stopped</span>
          <span class="evt-time mono">${time}</span>
        </div>
        <div class="evt-bottom">
          <span class="evt-reason" style="text-align:left">${reason || 'Session ended'}</span>
        </div>
      `;
    } else {
      // System / info message
      el.className = 'feed-evt info';
      el.innerHTML = `
        <div class="evt-top">
          <span class="evt-agent-badge" style="background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.4)">SYS</span>
          <span class="evt-game">${message || ''}</span>
          <span class="evt-time mono">${time}</span>
        </div>
      `;
    }

    feed.insertBefore(el, feed.firstChild);

    // Trim to 120 events max
    while (feed.children.length > 120) feed.removeChild(feed.lastChild);
  }

  /* ── Status pill ─────────────────────────────────────────── */
  function setStatus(running, demoMode) {
    const pill  = document.getElementById('statusPill');
    const label = document.getElementById('statusText');

    if (!pill) return;

    if (running) {
      pill.className = 'status-pill running';
      if (label) label.textContent = 'Live';
    } else {
      pill.className = 'status-pill stopped';
      if (label) label.textContent = 'Stopped';
    }

    const demoBadge = document.getElementById('demoBadge');
    if (demoBadge) demoBadge.style.display = demoMode ? 'flex' : 'none';
  }

  /* ── Aggregate bar ───────────────────────────────────────── */
  function updateAggBar(agents) {
    const bar = document.getElementById('aggregateBar');
    if (bar) bar.style.display = 'flex';

    const totalPnl   = agents.reduce((s, a) => s + a.netProfit, 0);
    const totalGames = agents.reduce((s, a) => s + a.totalGames, 0);
    const totalWins  = agents.reduce((s, a) => s + a.wins, 0);
    const totalBet   = agents.reduce((s, a) => s + a.totalBet, 0);
    const winRate    = totalGames > 0
      ? ((totalWins / totalGames) * 100).toFixed(1) + '%'
      : '0%';

    const pnlEl = document.getElementById('aggPnl');
    if (pnlEl) {
      pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + fmt(totalPnl);
      pnlEl.className   = 'agg-val ' + (totalPnl >= 0 ? 'pos' : 'neg');
    }

    const gamesEl = document.getElementById('aggGames');
    if (gamesEl) { gamesEl.textContent = totalGames; gamesEl.className = 'agg-val'; }

    const wrEl = document.getElementById('aggWinRate');
    if (wrEl) { wrEl.textContent = winRate; wrEl.className = 'agg-val'; }

    const betEl = document.getElementById('aggBet');
    if (betEl) { betEl.textContent = fmt(totalBet); betEl.className = 'agg-val'; }
  }

  /* ── Session analysis modal ─────────────────────────────── */
  function showModal(finalData) {
    const { agents, analyses, aggregate } = finalData;
    const body = document.getElementById('modalBody');
    if (!body) return;

    let html = '';

    agents.forEach(stats => {
      const analysis = analyses?.find(a => a.agentId === stats.agentId)?.analysis || '';
      const color  = agentColor(stats.agentId);
      const pnlCls = stats.netProfit >= 0 ? 'pos' : 'neg';
      const roiCls = parseFloat(stats.roi) >= 0 ? 'pos' : 'neg';

      html += `
        <div class="analysis-card">
          <div class="analysis-card-top">
            <div class="analysis-dot" style="background:${color}"></div>
            <div class="analysis-agent-name" style="color:${color}">${stats.agentId}</div>
          </div>
          <div class="analysis-stats-row">
            <div class="analysis-stat">
              <div class="analysis-stat-lbl">Final Balance</div>
              <div class="analysis-stat-val">${fmt(stats.currentBalance)}</div>
            </div>
            <div class="analysis-stat">
              <div class="analysis-stat-lbl">P&L</div>
              <div class="analysis-stat-val ${pnlCls}">${(stats.netProfit >= 0 ? '+' : '') + fmt(stats.netProfit)}</div>
            </div>
            <div class="analysis-stat">
              <div class="analysis-stat-lbl">Win Rate</div>
              <div class="analysis-stat-val">${stats.winRate}</div>
            </div>
            <div class="analysis-stat">
              <div class="analysis-stat-lbl">ROI</div>
              <div class="analysis-stat-val ${roiCls}">${stats.roi}</div>
            </div>
            <div class="analysis-stat">
              <div class="analysis-stat-lbl">Games</div>
              <div class="analysis-stat-val">${stats.totalGames}</div>
            </div>
          </div>
          ${analysis ? `<div class="analysis-text">"${analysis}"</div>` : ''}
        </div>
      `;
    });

    if (aggregate) {
      const aggCls = aggregate.totalProfit >= 0 ? 'pos' : 'neg';
      html += `
        <div class="agg-result-card">
          <div class="agg-result-title">Aggregate Results</div>
          <div class="agg-result-grid">
            <div class="agg-result-item">
              <div class="agg-result-lbl">Total P&L</div>
              <div class="agg-result-val ${aggCls}">${(aggregate.totalProfit >= 0 ? '+' : '') + fmt(aggregate.totalProfit)}</div>
            </div>
            <div class="agg-result-item">
              <div class="agg-result-lbl">Total Games</div>
              <div class="agg-result-val">${aggregate.totalGames}</div>
            </div>
            <div class="agg-result-item">
              <div class="agg-result-lbl">Win Rate</div>
              <div class="agg-result-val">${aggregate.overallWinRate}</div>
            </div>
          </div>
        </div>
      `;
    }

    body.innerHTML = html;
    document.getElementById('analysisModal').style.display = 'flex';
  }

  function hideModal() {
    const m = document.getElementById('analysisModal');
    if (m) m.style.display = 'none';
  }

  /* ── Public API ──────────────────────────────────────────── */
  return {
    createAgentCard,
    updateAgentCard,
    setThinking,
    addFeedEvent,
    setStatus,
    updateAggBar,
    showModal,
    hideModal,
    fmt,
    fmtTime,
    agentColor
  };
})();
