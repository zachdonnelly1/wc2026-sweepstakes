// Leaderboard page — arcade style rendering

let refreshTimer;

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

    const { prizes, teamStatus, groupGoals, playerMap } = computePrizes(matches, assignments, specialPrizes);
    const { playerPts } = computePlayerPoints(matches, playerMap);
    const prizeTotals = playerPrizeTotals(prizes);

    renderLeaderboard(playerMap, teamStatus, prizeTotals, prizes, playerPts);
    renderPrizePanel(prizes);
    renderMeta(matches);
  } catch (e) {
    console.error(e);
    document.getElementById('error-banner').textContent = 'LOAD ERROR: ' + e.message;
    document.getElementById('error-banner').style.display = 'block';
  }
  document.getElementById('refresh-btn').disabled = false;
}

function scheduleNextRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => { await refresh(); scheduleNextRefresh(); }, 5 * 60 * 1000);
}

function renderLeaderboard(playerMap, teamStatus, prizeTotals, prizes, playerPts) {
  const container = document.getElementById('players-grid');

  if (!Object.keys(playerMap).length) {
    container.innerHTML = `<div style="text-align:center;padding:60px 0">
      <div class="insert-coin">INSERT COIN</div>
      <div class="muted" style="margin-top:16px;font-size:.75rem">No players yet — check back after the draw</div>
    </div>`;
    return;
  }

  const sorted = Object.values(playerMap).sort((a, b) =>
    (playerPts[b.id] || 0) - (playerPts[a.id] || 0)
  );

  const prizesByPlayer = {};
  prizes.forEach(p => {
    if (!prizesByPlayer[p.player.id]) prizesByPlayer[p.player.id] = [];
    prizesByPlayer[p.player.id].push(p);
  });

  const rows = sorted.map((player, rank) => {
    const pts        = playerPts[player.id] || 0;
    const myPrizes   = prizesByPlayer[player.id] || [];
    const totals     = prizeTotals[player.id] || { locked: 0, pending: 0 };
    const rankNum    = String(rank + 1).padStart(2, '0');
    const rankClass  = rank === 0 ? 'rank--1' : rank === 1 ? 'rank--2' : rank === 2 ? 'rank--3' : '';
    const rowClass   = rank === 0 ? 'lb-row--1' : rank === 1 ? 'lb-row--2' : rank === 2 ? 'lb-row--3' : '';

    const teamTags = [1, 2, 3].map(tier => {
      const tid = player.teams[tier];
      if (!tid) return `<span class="team-tag team-tag--empty">T${tier}:?</span>`;
      const team   = getTeam(tid);
      const status = teamStatus[tid];
      const isOut  = status?.eliminated;
      return `<span class="team-tag ${isOut ? 'team-tag--out' : 'team-tag--alive'}" title="${team.name}">${team.flag} ${team.tla}</span>`;
    }).join('');

    const prizeTags = myPrizes.map(p =>
      `<span class="prize-tag prize-tag--${p.status === 'locked' ? 'locked' : 'pending'}">${p.label}</span>`
    ).join('');

    const moneyStr = totals.locked > 0
      ? `<span class="prize-money">€${totals.locked}</span>`
      : totals.pending > 0
        ? `<span class="prize-money" style="color:var(--alive)">€${totals.pending}?</span>`
        : '';

    return `<div class="lb-row ${rowClass}">
      <span class="rank ${rankClass}">${rankNum}</span>
      <span class="lb-name">${player.name.toUpperCase()}</span>
      <div class="lb-teams">${teamTags}</div>
      <div class="lb-badges">${prizeTags}${moneyStr}</div>
      <span class="lb-score">${pts.toLocaleString()}</span>
    </div>`;
  });

  container.innerHTML = `<div class="lb-table">${rows.join('')}</div>`;
}

function renderPrizePanel(prizes) {
  const defs = [
    { type:'winner',        label:'Tournament Winner', amount:120, icon:'🏆' },
    { type:'runner_up',     label:'Runner-Up',         amount:50,  icon:'🥈' },
    { type:'semi_finalist', label:'Semi-Finalist (×2)', amount:15, icon:'🎖️' },
    { type:'underdog_hero', label:'Underdog Hero',      amount:20, icon:'🦁' },
    { type:'beautiful_loser',label:'Beautiful Loser',   amount:15, icon:'💐' },
    { type:'wooden_spoon',  label:'Wooden Spoon',       amount:5,  icon:'🥄' },
  ];
  const prizeMap = {};
  prizes.forEach(p => { if (!prizeMap[p.type]) prizeMap[p.type] = []; prizeMap[p.type].push(p); });

  document.getElementById('prize-panel').innerHTML = `<div class="prize-rows">` +
    defs.map(def => {
      const won = prizeMap[def.type] || [];
      const cls = won.length ? (won[0].status === 'locked' ? 'locked' : 'pending') : '';
      const winner = won.map(p => p.player.name.toUpperCase()).join(', ') || '—';
      return `<div class="prize-row prize-row--${cls}">
        <span class="prize-icon">${def.icon}</span>
        <span class="prize-label">${def.label}</span>
        <span class="prize-amount">€${def.amount}</span>
        <span class="prize-winner">${winner}</span>
      </div>`;
    }).join('') + `</div>`;
}

function renderMeta(matches) {
  const age = API.cacheAge();
  const timeStr = age === null ? 'NEVER'
    : age < 60 ? `${age}S AGO`
    : `${Math.round(age / 60)}M AGO`;

  const played = matches.filter(m => m.status === 'FINISHED').length;
  document.getElementById('last-updated').textContent = `LAST UPDATED: ${timeStr}`;
  document.getElementById('match-count').textContent  = `${played} / ${matches.length} MATCHES PLAYED`;
}

function shareWhatsApp() {
  const url = window.location.href.split('?')[0].replace('/wc2026-sweepstakes/', '/');
  const rows = document.querySelectorAll('.lb-row');
  const lines = ['⚽ WC2026 SWEEPSTAKES ⚽', ''];
  let i = 0;
  rows.forEach(row => {
    if (i >= 5) return;
    const rank   = row.querySelector('.rank')?.textContent || '';
    const name   = row.querySelector('.lb-name')?.textContent || '';
    const score  = row.querySelector('.lb-score')?.textContent || '';
    const teams  = [...row.querySelectorAll('.team-tag')].map(t => t.textContent.trim()).join(' ');
    lines.push(`${rank} ${name} — ${teams} — ${score} pts`);
    i++;
  });
  lines.push('', `🔴 LIVE: ${url}`);
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-btn').addEventListener('click', () => refresh(true));
  document.getElementById('whatsapp-btn').addEventListener('click', shareWhatsApp);
  initLeaderboard();
});
