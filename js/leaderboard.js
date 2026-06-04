// Leaderboard — stage-based ranking (no artificial points)

let refreshTimer;

const ROUND_VALUE = {
  FINAL: 700, SEMI_FINALS: 600, QUARTER_FINALS: 500,
  LAST_16: 400, LAST_32: 300, GROUP_STAGE: 100,
};
const ROUND_SHORT = {
  FINAL: 'FINAL', SEMI_FINALS: 'SEMI', QUARTER_FINALS: 'QTR',
  LAST_16: 'R16', LAST_32: 'R32', GROUP_STAGE: 'GRP',
};

async function initLeaderboard() {
  await refresh();
  scheduleNextRefresh();
}

async function refresh(force = false) {
  document.getElementById('refresh-btn').disabled = true;
  document.getElementById('error-banner').style.display = 'none';
  try {
    const [matches, assignments, specialPrizes] = await Promise.all([
      API.fetchMatches(force),
      DB.getAssignments(),
      DB.getSpecialPrizes(),
    ]);
    const { prizes, teamStatus, playerMap } = computePrizes(matches, assignments, specialPrizes);
    const prizeTotals = playerPrizeTotals(prizes);
    renderStats(matches, teamStatus, playerMap);
    renderLeaderboard(playerMap, teamStatus, prizeTotals, prizes);
    renderPrizePanel(prizes);
    renderMeta(matches);
  } catch (e) {
    console.error(e);
    document.getElementById('error-banner').textContent = 'ERROR: ' + e.message;
    document.getElementById('error-banner').style.display = 'block';
  }
  document.getElementById('refresh-btn').disabled = false;
}

function scheduleNextRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => { await refresh(); scheduleNextRefresh(); }, 5 * 60 * 1000);
}

function rankPlayers(playerMap, teamStatus) {
  const bestRound = (p) => Math.max(
    ...Object.values(p.teams).map(tid => {
      const s = teamStatus[tid];
      return s ? (ROUND_VALUE[s.stage] || 0) : 0;
    }), 0
  );
  const aliveCount = (p) =>
    Object.values(p.teams).filter(tid => !teamStatus[tid]?.eliminated).length;

  return Object.values(playerMap).sort((a, b) => {
    const aAlive = aliveCount(a), bAlive = aliveCount(b);
    if (bAlive !== aAlive) return bAlive - aAlive;
    const aRound = bestRound(a), bRound = bestRound(b);
    if (bRound !== aRound) return bRound - aRound;
    return a.name.localeCompare(b.name);
  });
}

function getCurrentStage(matches) {
  const order = ['FINAL','SEMI_FINALS','QUARTER_FINALS','LAST_16','LAST_32','GROUP_STAGE'];
  const labels = {
    FINAL:'FINAL', SEMI_FINALS:'SEMI-FINALS', QUARTER_FINALS:'QTR-FINALS',
    LAST_16:'RD OF 16', LAST_32:'RD OF 32', GROUP_STAGE:'GROUP STAGE',
  };
  for (const s of order) {
    if (matches.some(m => m.stage === s && (m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'PAUSED')))
      return labels[s];
  }
  return 'PRE-TOURNAMENT';
}

function renderStats(matches, teamStatus, playerMap) {
  const allTeams = [...TEAMS.tier1, ...TEAMS.tier2, ...TEAMS.tier3];
  const alive = allTeams.filter(t => !teamStatus[t.id]?.eliminated).length;
  const stage = getCurrentStage(matches);
  document.getElementById('stat-alive').textContent   = alive || '—';
  document.getElementById('stat-stage').textContent   = stage;
  document.getElementById('stat-players').textContent = Object.keys(playerMap).length || '—';
  document.getElementById('header-stage').textContent = stage;
}

function renderLeaderboard(playerMap, teamStatus, prizeTotals, prizes) {
  const container = document.getElementById('players-grid');

  if (!Object.keys(playerMap).length) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px 20px">
      <div class="insert-coin">INSERT COIN</div>
      <p style="font-family:var(--font-pixel);font-size:7px;color:var(--text-dim);margin-top:16px">NO PLAYERS YET</p>
    </div>`;
    return;
  }

  const sorted = rankPlayers(playerMap, teamStatus);

  const prizesByPlayer = {};
  prizes.forEach(p => {
    if (!prizesByPlayer[p.player.id]) prizesByPlayer[p.player.id] = [];
    prizesByPlayer[p.player.id].push(p);
  });

  const rows = sorted.map((player, rank) => {
    const rankNum = String(rank + 1).padStart(2, '0');
    const rankCls = rank === 0 ? 'rank-1' : rank === 1 ? 'rank-2' : rank === 2 ? 'rank-3' : '';
    const myPrizes   = prizesByPlayer[player.id] || [];
    const totals     = prizeTotals[player.id] || { locked: 0, pending: 0 };

    const teamSpans = [1, 2, 3].map(tier => {
      const tid = player.teams[tier];
      if (!tid) return `<span style="color:var(--text-dim)">???</span>`;
      const team   = getTeam(tid);
      const status = teamStatus[tid];
      const isOut  = status?.eliminated;
      const round  = status?.stage ? ROUND_SHORT[status.stage] || '' : '';
      const roundTag = round && !isOut ? ` <span style="font-size:.6em;color:var(--text-dim)">[${round}]</span>` : '';
      return `<span class="${isOut ? 'eliminated' : 'alive'}" title="${team.name}">${team.flag} ${team.tla}${roundTag}</span>`;
    });
    const teamsHtml = teamSpans.join(`<span style="color:var(--border-active)"> · </span>`);

    const badges = myPrizes.map(p =>
      `<span class="badge ${p.status === 'locked' ? 'badge-yellow' : 'badge-teal'}">${p.label}</span>`
    ).join('');

    const moneyStr = totals.locked > 0
      ? `<span class="badge badge-yellow">€${totals.locked}</span>`
      : totals.pending > 0
        ? `<span class="badge badge-teal">€${totals.pending}?</span>`
        : '';

    // Alive count indicator
    const aliveCount = [1,2,3].filter(t => player.teams[t] && !teamStatus[player.teams[t]]?.eliminated).length;
    const aliveStr = aliveCount === 3 ? '●●●' : aliveCount === 2 ? '●●○' : aliveCount === 1 ? '●○○' : '○○○';
    const aliveColor = aliveCount === 3 ? 'var(--teal)' : aliveCount === 2 ? 'var(--blue)' : aliveCount === 1 ? 'var(--muted)' : 'var(--text-dim)';

    return `<div class="lb-row ${rankCls}">
      <span class="lb-rank ${rank === 0 ? 'gold' : ''}">${rankNum}</span>
      <div class="lb-name-col">
        <span class="lb-name">${player.name.toUpperCase()}</span>
        <div class="lb-badges" style="margin-top:4px">${badges}${moneyStr}</div>
      </div>
      <span class="lb-teams">${teamsHtml}</span>
      <span style="font-family:var(--font-pixel);font-size:8px;color:${aliveColor};letter-spacing:2px;text-align:right">${aliveStr}</span>
    </div>`;
  });

  container.innerHTML = `<div class="card" style="padding:12px;margin-bottom:16px">${rows.join('')}</div>`;
}

function renderPrizePanel(prizes) {
  const defs = [
    { type:'winner',         name:'Tournament winner',  desc:'Team lifts the trophy',          amt:120 },
    { type:'runner_up',      name:'Runner-up',          desc:'Team reaches the final',         amt:50  },
    { type:'semi_finalist',  name:'Semi-final split',   desc:'Both SF losers — €15 each',      amt:15  },
    { type:'underdog_hero',  name:'Underdog hero',      desc:'Last Tier 3 team still alive',   amt:20  },
    { type:'beautiful_loser',name:'Beautiful loser',    desc:'Most goals by group stage exit', amt:15  },
    { type:'wooden_spoon',   name:'Wooden spoon',       desc:'Most goals conceded, all 3 teams',amt:5  },
  ];
  const prizeMap = {};
  prizes.forEach(p => { if (!prizeMap[p.type]) prizeMap[p.type] = []; prizeMap[p.type].push(p); });

  document.getElementById('prize-panel').innerHTML = defs.map(def => {
    const won    = prizeMap[def.type] || [];
    const cls    = won.length ? (won[0].status === 'locked' ? 'won' : 'pending') : '';
    const winner = won.map(p => p.player.name.toUpperCase()).join(', ') || '—';
    return `<div class="prize-row ${cls}">
      <span class="prize-name">${def.name}</span>
      <span class="prize-desc">${def.desc}</span>
      <span class="prize-amt">€${def.amt}</span>
      <span class="prize-winner">${winner}</span>
    </div>`;
  }).join('');
}

function renderMeta(matches) {
  const age = API.cacheAge();
  const t = age === null ? 'NEVER' : age < 60 ? `${age}S AGO` : `${Math.round(age/60)}M AGO`;
  const played = matches.filter(m => m.status === 'FINISHED').length;
  document.getElementById('last-updated').textContent = `${played}/${matches.length} MATCHES · UPDATED ${t}`;
}

function shareWhatsApp() {
  const rows = document.querySelectorAll('.lb-row');
  const lines = ['⚽ WC2026 SWEEPSTAKES ⚽', ''];
  let i = 0;
  rows.forEach(row => {
    if (i++ >= 5) return;
    const rank  = row.querySelector('.lb-rank')?.textContent || '';
    const name  = row.querySelector('.lb-name')?.textContent || '';
    const teams = [...row.querySelectorAll('.lb-teams .alive,.lb-teams .eliminated')]
      .map(s => s.textContent.trim().split(' ')[1] || '').filter(Boolean).join(' ');
    lines.push(`${rank} ${name} — ${teams}`);
  });
  lines.push('', `🔴 LIVE: ${location.href}`);
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-btn').addEventListener('click', () => refresh(true));
  document.getElementById('whatsapp-btn').addEventListener('click', shareWhatsApp);
  initLeaderboard();
});
