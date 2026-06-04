// Leaderboard page logic

let refreshTimer;

async function initLeaderboard() {
  await refresh();
  scheduleNextRefresh();
}

async function refresh(force = false) {
  document.getElementById('refresh-btn').disabled = true;
  try {
    const [matches, assignments, specialPrizes] = await Promise.all([
      API.fetchMatches(force),
      DB.getAssignments(),
      DB.getSpecialPrizes(),
    ]);

    const { prizes, teamStatus, groupGoals, playerMap } = computePrizes(matches, assignments, specialPrizes);
    const prizeTotals = playerPrizeTotals(prizes);

    renderLeaderboard(playerMap, teamStatus, groupGoals, prizeTotals, prizes);
    renderPrizePanel(prizes);
    renderMeta(matches);
  } catch (e) {
    console.error(e);
    document.getElementById('error-banner').textContent = 'Failed to load data: ' + e.message;
    document.getElementById('error-banner').style.display = 'block';
  }
  document.getElementById('refresh-btn').disabled = false;
}

function scheduleNextRefresh() {
  clearTimeout(refreshTimer);
  // Poll every 2 min — we don't know if matches are live without fetching
  refreshTimer = setTimeout(async () => {
    await refresh();
    scheduleNextRefresh();
  }, 2 * 60 * 1000);
}

function renderLeaderboard(playerMap, teamStatus, groupGoals, prizeTotals, prizes) {
  const container = document.getElementById('players-grid');

  if (!Object.keys(playerMap).length) {
    container.innerHTML = '<p class="muted center">No players yet — check back after the draw!</p>';
    return;
  }

  // Sort players: most locked prize money first, then pending
  const sorted = Object.values(playerMap).sort((a, b) => {
    const ta = prizeTotals[a.id] || { locked: 0, pending: 0 };
    const tb = prizeTotals[b.id] || { locked: 0, pending: 0 };
    return (tb.locked + tb.pending / 2) - (ta.locked + ta.pending / 2);
  });

  const prizesByPlayer = {};
  prizes.forEach(p => {
    const id = p.player.id;
    if (!prizesByPlayer[id]) prizesByPlayer[id] = [];
    prizesByPlayer[id].push(p);
  });

  container.innerHTML = sorted.map((player, rank) => {
    const totals = prizeTotals[player.id] || { locked: 0, pending: 0 };
    const myPrizes = prizesByPlayer[player.id] || [];

    const teamChips = [1, 2, 3].map(tier => {
      const tid = player.teams[tier];
      if (!tid) return `<div class="team-chip team-chip--empty"><span>T${tier}: TBD</span></div>`;
      const team = getTeam(tid);
      const status = teamStatus[tid];
      const statusClass = !status ? 'alive' : status.eliminated ? 'out' : 'alive';
      const statusLabel = !status
        ? 'Group Stage'
        : status.eliminated
          ? `Out (${status.round})`
          : `In — ${status.round}`;

      return `<div class="team-chip team-chip--t${tier} team-chip--${statusClass}">
        <img class="crest" src="https://crests.football-data.org/${tid}.svg" alt="${team.tla}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='inline'">
        <span class="crest-fallback" style="display:none">${team.flag}</span>
        <div class="team-info">
          <span class="team-name">${team.name}</span>
          <span class="team-status">${statusLabel}</span>
        </div>
        <span class="tier-badge">T${tier}</span>
      </div>`;
    }).join('');

    const prizeChips = myPrizes.length
      ? myPrizes.map(p => `<span class="prize-chip prize-chip--${p.status}">
          ${prizeIcon(p.type)} ${p.label} €${p.amount}
        </span>`).join('')
      : '';

    const rankIcon = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`;

    return `<div class="player-card ${totals.locked > 0 ? 'player-card--winner' : ''}">
      <div class="player-header">
        <span class="rank">${rankIcon}</span>
        <span class="player-name">${player.name}</span>
        <div class="prize-total">
          ${totals.locked > 0 ? `<span class="locked-amount">€${totals.locked}</span>` : ''}
          ${totals.pending > 0 ? `<span class="pending-amount">+€${totals.pending}?</span>` : ''}
        </div>
      </div>
      <div class="team-chips">${teamChips}</div>
      ${prizeChips ? `<div class="prize-chips">${prizeChips}</div>` : ''}
    </div>`;
  }).join('');
}

function renderPrizePanel(prizes) {
  const panel = document.getElementById('prize-panel');
  const definitions = [
    { type: 'winner',        label: 'Tournament Winner', amount: 120, icon: '🏆' },
    { type: 'runner_up',     label: 'Runner-Up',         amount: 50,  icon: '🥈' },
    { type: 'semi_finalist', label: 'Semi-Finalist (×2)',amount: 15,  icon: '🎖️' },
    { type: 'underdog_hero', label: 'Underdog Hero',     amount: 20,  icon: '🦁' },
    { type: 'beautiful_loser',label: 'Beautiful Loser',  amount: 15,  icon: '💐' },
    { type: 'wooden_spoon',  label: 'Wooden Spoon',      amount: 5,   icon: '🥄' },
  ];

  const prizeMap = {};
  prizes.forEach(p => {
    if (!prizeMap[p.type]) prizeMap[p.type] = [];
    prizeMap[p.type].push(p);
  });

  panel.innerHTML = definitions.map(def => {
    const won = prizeMap[def.type] || [];
    const statusClass = won.length ? (won[0].status === 'locked' ? 'locked' : 'pending') : 'open';
    const winnerText = won.map(p => p.player.name).join(', ') || '—';
    return `<div class="prize-row prize-row--${statusClass}">
      <span class="prize-icon">${def.icon}</span>
      <span class="prize-label">${def.label}</span>
      <span class="prize-amount">€${def.amount}</span>
      <span class="prize-winner">${winnerText}</span>
    </div>`;
  }).join('');
}

function renderMeta(matches) {
  const age = API.cacheAge();
  const ageStr = age === null ? 'never' : age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`;
  document.getElementById('last-updated').textContent = `Updated ${ageStr}`;

  const played = matches.filter(m => m.status === 'FINISHED').length;
  document.getElementById('match-count').textContent = `${played} / ${matches.length} matches played`;
}

function prizeIcon(type) {
  const icons = { winner: '🏆', runner_up: '🥈', semi_finalist: '🎖️', underdog_hero: '🦁', beautiful_loser: '💐', wooden_spoon: '🥄' };
  return icons[type] || '🎁';
}

function shareWhatsApp() {
  const url = window.location.href.split('?')[0];
  const lines = ['⚽ WC2026 Sweepstakes Standings ⚽', ''];

  const container = document.getElementById('players-grid');
  const cards = container.querySelectorAll('.player-card');
  let rank = 1;
  cards.forEach(card => {
    const name = card.querySelector('.player-name').textContent;
    const locked = card.querySelector('.locked-amount')?.textContent || '€0';
    const teams = [...card.querySelectorAll('.team-name')].map(el => el.textContent).join(', ');
    lines.push(`${rank++}. ${name} — ${locked} — ${teams}`);
  });

  lines.push('', `View live: ${url}`);
  const msg = encodeURIComponent(lines.join('\n'));
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-btn').addEventListener('click', () => refresh(true));
  document.getElementById('whatsapp-btn').addEventListener('click', shareWhatsApp);
  initLeaderboard();
});
