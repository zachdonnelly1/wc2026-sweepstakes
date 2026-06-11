// Leaderboard — ranked by wins + goal difference, with prize predictions

let refreshTimer;
let lastMatches = [];

const PRIZE_META = {
  winner:          { icon: '🏆', label: 'TOURNAMENT WINNER' },
  runner_up:       { icon: '🥈', label: 'RUNNER-UP'         },
  semi_finalist:   { icon: '🎖️', label: 'SEMI-FINAL'        },
  underdog_hero:   { icon: '🦁', label: 'UNDERDOG HERO'     },
  beautiful_loser: { icon: '💐', label: 'BEAUTIFUL LOSER'   },
  wooden_spoon:    { icon: '🥄', label: 'WOODEN SPOON'      },
};
const PRIZE_ORDER = ['winner','runner_up','semi_finalist','underdog_hero','beautiful_loser','wooden_spoon'];

function prizeKey(p) { return `${p.type}_${p.player.id}`; }

// ─── Payout banner ────────────────────────────────────────────────────
function checkAndShowPayoutBanner(prizes) {
  const locked = prizes.filter(p => p.status === 'locked');
  if (!locked.length) return;

  const seenKey = 'wc2026_seen_payouts';
  const seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]'));
  const newPayouts = locked.filter(p => !seen.has(prizeKey(p)));
  if (!newPayouts.length) return;

  const top = [...newPayouts].sort((a, b) => b.amount - a.amount)[0];
  const meta = PRIZE_META[top.type] || { icon: '🏅', label: top.label };
  const totalNew = newPayouts.reduce((s, p) => s + p.amount, 0);

  const eyebrow = newPayouts.length > 1
    ? `🎉 ${newPayouts.length} NEW PAYOUTS LOCKED IN`
    : '🎉 PAYOUT LOCKED IN';
  const msg = newPayouts.length > 1
    ? `${meta.label} · ${top.player.name.toUpperCase()} +${newPayouts.length - 1} MORE`
    : `${meta.label} — ${top.player.name.toUpperCase()} WINS €${top.amount}`;

  document.getElementById('payout-banner-icon').textContent  = meta.icon;
  document.getElementById('payout-banner-eyebrow').textContent = eyebrow;
  document.getElementById('payout-banner-msg').textContent   = msg;
  document.getElementById('payout-banner-amt').textContent   = `€${totalNew}`;

  const banner = document.getElementById('payout-banner');
  banner.style.display = 'block';
  banner.style.animation = 'none';
  void banner.offsetWidth; // reflow to restart animation
  banner.style.animation = '';

  locked.forEach(p => seen.add(prizeKey(p)));
  localStorage.setItem(seenKey, JSON.stringify([...seen]));

  const timer = setTimeout(dismissPayoutBanner, 9000);
  document.getElementById('payout-banner-close').onclick = () => { clearTimeout(timer); dismissPayoutBanner(); };
}

function dismissPayoutBanner() {
  const banner = document.getElementById('payout-banner');
  banner.style.animation = 'slideUp .3s ease forwards';
  setTimeout(() => { banner.style.display = 'none'; banner.style.animation = ''; }, 300);
}

// ─── Payouts timeline ─────────────────────────────────────────────────
function renderPayoutsTimeline(prizes) {
  const locked = prizes.filter(p => p.status === 'locked');
  const section = document.getElementById('payouts-section');
  if (!locked.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const totalPaid = locked.reduce((s, p) => s + p.amount, 0);
  const sorted = [...locked].sort((a, b) =>
    (PRIZE_ORDER.indexOf(a.type) ?? 99) - (PRIZE_ORDER.indexOf(b.type) ?? 99)
  );

  document.getElementById('payouts-timeline').innerHTML = `
    <div class="card" style="padding:0;margin-bottom:16px">
      <div style="padding:14px 14px 0;display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
        <p class="panel-title" style="margin:0;border:none;padding:0">// PAYOUTS — PRIZES LOCKED IN</p>
        <span style="font-family:var(--font-pixel);font-size:9px;color:var(--yellow)">€${totalPaid} PAID OUT</span>
      </div>
      ${sorted.map(p => {
        const meta = PRIZE_META[p.type] || { icon: '🏅', label: p.label };
        return `<div class="payout-row">
          <span class="payout-icon">${meta.icon}</span>
          <div class="payout-info">
            <span class="payout-prize-name">${meta.label}</span>
            <span class="payout-player">${p.player.name.toUpperCase()}</span>
          </div>
          <span class="payout-amt">€${p.amount}</span>
          <span class="badge badge-yellow" style="font-size:5px">LOCKED</span>
        </div>`;
      }).join('')}
    </div>`;
}

// ─── Team stats from match data ───────────────────────────────────────
function buildTeamStats(matches) {
  const stats = {};
  matches.filter(m => m.status === 'FINISHED').forEach(m => {
    const h = m.homeTeam.id, a = m.awayTeam.id;
    const hg = m.score?.fullTime?.home ?? 0;
    const ag = m.score?.fullTime?.away ?? 0;
    if (!stats[h]) stats[h] = { wins:0, gd:0, scored:0, conceded:0, played:0 };
    if (!stats[a]) stats[a] = { wins:0, gd:0, scored:0, conceded:0, played:0 };
    stats[h].played++; stats[a].played++;
    stats[h].scored += hg; stats[h].conceded += ag; stats[h].gd += (hg-ag);
    stats[a].scored += ag; stats[a].conceded += hg; stats[a].gd += (ag-hg);
    if (m.score?.winner === 'HOME_TEAM') stats[h].wins++;
    else if (m.score?.winner === 'AWAY_TEAM') stats[a].wins++;
  });
  return stats;
}

const ROUND_ORDER = ['GROUP_STAGE','LAST_32','LAST_16','QUARTER_FINALS','SEMI_FINALS','THIRD_PLACE','FINAL'];

function playerSummary(player, teamStats, teamStatus) {
  const tids = Object.values(player.teams).filter(Boolean);
  const roundVal = id => {
    const s = teamStatus[id];
    if (!s) return 0;
    return Math.max(0, ROUND_ORDER.indexOf(s.stage));
  };
  return {
    wins:      tids.reduce((s, id) => s + (teamStats[id]?.wins || 0), 0),
    gd:        tids.reduce((s, id) => s + (teamStats[id]?.gd   || 0), 0),
    alive:     tids.filter(id => !teamStatus[id]?.eliminated).length,
    bestRound: tids.length ? Math.max(0, ...tids.map(roundVal)) : 0,
  };
}

// ─── Predictions ──────────────────────────────────────────────────────
function computePredictions(matches, playerMap, teamStatus) {
  const ts = buildTeamStats(matches);
  const groupFinished = matches.filter(m => m.stage === 'GROUP_STAGE' && m.status === 'FINISHED');

  // Group stage goals per team
  const groupGoals = {};
  groupFinished.forEach(m => {
    const h = m.homeTeam.id, a = m.awayTeam.id;
    const hg = m.score?.fullTime?.home ?? 0;
    const ag = m.score?.fullTime?.away ?? 0;
    if (!groupGoals[h]) groupGoals[h] = { scored:0, conceded:0, played:0 };
    if (!groupGoals[a]) groupGoals[a] = { scored:0, conceded:0, played:0 };
    groupGoals[h].scored += hg; groupGoals[h].conceded += ag; groupGoals[h].played++;
    groupGoals[a].scored += ag; groupGoals[a].conceded += hg; groupGoals[a].played++;
  });

  // Underdog Hero: alive T3 teams ranked by stage → wins → GD
  // Fallback when all T3 eliminated: show the last one out (actual winner) until prize locks
  const t3mapped = TEAMS.tier3.map(t => ({
    team: t,
    wins:  ts[t.id]?.wins || 0,
    gd:    ts[t.id]?.gd   || 0,
    stage: Math.max(0, ROUND_ORDER.indexOf(teamStatus[t.id]?.stage)),
    eliminated: !!teamStatus[t.id]?.eliminated,
    player: findPlayerByTeam(t.id, playerMap),
  }));
  const t3sortFn = (a, b) => {
    if (b.stage !== a.stage) return b.stage - a.stage;
    if (b.wins  !== a.wins)  return b.wins  - a.wins;
    return b.gd - a.gd;
  };
  const t3aliveList = t3mapped.filter(t => !t.eliminated);
  const underdogTop3 = t3aliveList.length > 0
    ? [...t3aliveList].sort(t3sortFn).slice(0, 3)
    : [...t3mapped].sort(t3sortFn).slice(0, 1);

  // Beautiful Loser:
  // - Pre-tournament: nothing (no goals yet)
  // - During group stage: predictive — alive teams with most goals but fewest wins
  // - Once R32 starts: locked to only actually eliminated group-stage teams
  const last32Started = matches.some(m => m.stage === 'LAST_32' && ['FINISHED','IN_PLAY','PAUSED'].includes(m.status));
  const allTeams = [...TEAMS.tier1, ...TEAMS.tier2, ...TEAMS.tier3];
  const eliminatedInGroups = allTeams.filter(t => teamStatus[t.id]?.eliminated && teamStatus[t.id]?.stage === 'GROUP_STAGE');
  const blPredictive = !last32Started && eliminatedInGroups.length === 0;
  const blPool = (last32Started || eliminatedInGroups.length > 0) ? eliminatedInGroups : allTeams;

  const beautifulTop3 = blPool
    .map(t => {
      const g = groupGoals[t.id] || { scored:0, played:0 };
      const wins = ts[t.id]?.wins || 0;
      return { team:t, goals: g.scored, played: g.played, wins, gpg: g.played>0?(g.scored/g.played).toFixed(1):'—', player: findPlayerByTeam(t.id, playerMap), predicted: blPredictive };
    })
    .filter(t => t.goals > 0)
    .sort((a,b) => {
      if (blPredictive) return b.goals - a.goals || a.wins - b.wins;
      return b.goals - a.goals || parseFloat(b.gpg) - parseFloat(a.gpg);
    })
    .slice(0, 3);

  // Wooden Spoon: top 3 players by combined group stage goals conceded
  // Only meaningful once games have been played — filter out 0s
  // After R32 starts the group stage is final
  const woodenTop3 = Object.values(playerMap)
    .map(player => {
      const conceded = Object.values(player.teams).reduce((sum, tid) => sum + (groupGoals[tid]?.conceded||0), 0);
      const detail = [1,2,3].map(tier => {
        const tid = player.teams[tier];
        return tid ? `${getTeam(tid)?.tla||'?'} ${groupGoals[tid]?.conceded||0}` : '?';
      }).join(' · ');
      return { player, conceded, detail, predicted: !last32Started };
    })
    .filter(p => p.conceded > 0)
    .sort((a,b) => b.conceded - a.conceded)
    .slice(0, 3);

  return { underdogTop3, beautifulTop3, woodenTop3 };
}

// ─── Main ─────────────────────────────────────────────────────────────
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
    lastMatches = matches;
    const { prizes, teamStatus, playerMap } = computePrizes(matches, assignments, specialPrizes);
    const prizeTotals = playerPrizeTotals(prizes);
    const teamStats   = buildTeamStats(matches);
    const predictions = computePredictions(matches, playerMap, teamStatus);

    renderStats(matches, teamStatus, playerMap, teamStats);
    renderLeaderboard(playerMap, teamStatus, prizeTotals, prizes, teamStats);
    renderDailySummary();
    renderPayoutsTimeline(prizes);
    checkAndShowPayoutBanner(prizes);
    renderPredictions(predictions, specialPrizes);
    renderPrizePanel(prizes);
    renderMeta(matches);
  } catch (e) {
    console.error(e);
    document.getElementById('error-banner').textContent = 'ERROR: ' + e.message;
    document.getElementById('error-banner').style.display = 'block';
  }
  document.getElementById('refresh-btn').disabled = false;
}

async function renderDailySummary() {
  try {
    const res = await fetch(`data/daily-summary.json?t=${Date.now()}`);
    const data = await res.json();
    if (!data.summary) return;
    const section = document.getElementById('daily-summary-section');
    const date = new Date(data.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    document.getElementById('summary-game-day').textContent = `GAME DAY ${data.gameDay}`;
    document.getElementById('summary-date').textContent = date;
    document.getElementById('summary-body').textContent = data.summary;
    section.style.display = 'block';
  } catch (_) {}
}

function scheduleNextRefresh() {
  clearTimeout(refreshTimer);
  const live = API.isLiveOrImminent(lastMatches);
  const delay = live ? 60 * 1000 : 5 * 60 * 1000;
  refreshTimer = setTimeout(async () => { await refresh(); scheduleNextRefresh(); }, delay);
}

function getCurrentStage(matches) {
  const order = ['FINAL','SEMI_FINALS','QUARTER_FINALS','LAST_16','LAST_32','GROUP_STAGE'];
  const labels = { FINAL:'FINAL', SEMI_FINALS:'SEMI-FINALS', QUARTER_FINALS:'QTR-FINALS', LAST_16:'RD OF 16', LAST_32:'RD OF 32', GROUP_STAGE:'GROUP STAGE' };
  for (const s of order) {
    if (matches.some(m => m.stage === s && (m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'PAUSED')))
      return labels[s];
  }
  return 'PRE-TOURNAMENT';
}

function renderStats(matches, teamStatus, playerMap, teamStats) {
  const allTeams     = [...TEAMS.tier1, ...TEAMS.tier2, ...TEAMS.tier3];
  const teamsAlive   = allTeams.filter(t => !teamStatus[t.id]?.eliminated).length;
  const stage        = getCurrentStage(matches);
  const playerCount  = Object.keys(playerMap).length;
  const playersAlive = Object.values(playerMap).filter(p =>
    Object.values(p.teams).some(tid => !teamStatus[tid]?.eliminated)
  ).length;

  document.getElementById('stat-alive').textContent         = teamsAlive || '—';
  document.getElementById('stat-stage').textContent         = stage;
  document.getElementById('stat-players').textContent       = playerCount || '—';
  document.getElementById('stat-players-alive').textContent = playersAlive || playerCount || '—';
  document.getElementById('header-stage').textContent       = stage;
}

function renderLeaderboard(playerMap, teamStatus, prizeTotals, prizes, teamStats) {
  const container = document.getElementById('players-grid');

  if (!Object.keys(playerMap).length) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:48px 20px">
      <div class="insert-coin">INSERT COIN</div>
      <p style="font-family:var(--font-pixel);font-size:7px;color:var(--text-dim);margin-top:16px">NO PLAYERS YET</p>
    </div>`;
    return;
  }

  const sorted = Object.values(playerMap).sort((a, b) => {
    const sa = playerSummary(a, teamStats, teamStatus);
    const sb = playerSummary(b, teamStats, teamStatus);
    if (sb.alive     !== sa.alive)     return sb.alive     - sa.alive;
    if (sb.bestRound !== sa.bestRound) return sb.bestRound - sa.bestRound;
    if (sb.wins      !== sa.wins)      return sb.wins      - sa.wins;
    if (sb.gd        !== sa.gd)        return sb.gd        - sa.gd;
    return a.name.localeCompare(b.name);
  });

  const prizesByPlayer = {};
  prizes.forEach(p => {
    if (!prizesByPlayer[p.player.id]) prizesByPlayer[p.player.id] = [];
    prizesByPlayer[p.player.id].push(p);
  });

  const rows = sorted.map((player, rank) => {
    const sum     = playerSummary(player, teamStats, teamStatus);
    const rankNum = String(rank + 1).padStart(2, '0');
    const rankCls = rank === 0 ? 'rank-1' : rank === 1 ? 'rank-2' : rank === 2 ? 'rank-3' : '';
    const myPrizes = prizesByPlayer[player.id] || [];
    const totals   = prizeTotals[player.id] || { locked:0, pending:0 };

    const teamSpans = [1, 2, 3].map(tier => {
      const tid = player.teams[tier];
      if (!tid) return `<span style="color:var(--text-dim)">???</span>`;
      const team   = getTeam(tid);
      const isOut  = teamStatus[tid]?.eliminated;
      return `<span class="${isOut ? 'eliminated' : 'alive'}" title="${team.name}">${team.flag} ${team.tla}</span>`;
    });
    const teamsHtml = teamSpans.join(`<span style="color:var(--border-active)"> · </span>`);

    const badges = myPrizes.map(p =>
      `<span class="badge ${p.status === 'locked' ? 'badge-yellow' : 'badge-teal'}">${p.label}</span>`
    ).join('');
    const money = totals.locked > 0
      ? `<span class="badge badge-yellow">€${totals.locked}</span>`
      : totals.pending > 0 ? `<span class="badge badge-teal">€${totals.pending}?</span>` : '';

    const gdStr = sum.gd > 0 ? `+${sum.gd}` : `${sum.gd}`;
    const statStr = `${sum.wins}W ${gdStr}`;

    return `<div class="lb-row ${rankCls}">
      <span class="lb-rank ${rank === 0 ? 'gold' : ''}">${rankNum}</span>
      <div class="lb-name-col">
        <span class="lb-name">${player.name.toUpperCase()}</span>
        <div class="lb-badges" style="margin-top:4px">${badges}${money}</div>
      </div>
      <span class="lb-teams">${teamsHtml}</span>
      <span style="font-family:var(--font-pixel);font-size:7px;color:${rank===0?'var(--yellow)':rank===1?'var(--blue)':'var(--text-dim)'};text-align:right;white-space:nowrap">${statStr}</span>
    </div>`;
  });

  container.innerHTML = `<div class="card" style="padding:12px;margin-bottom:16px">${rows.join('')}</div>`;
}

// ─── Predictions section ──────────────────────────────────────────────
function renderPredictions({ underdogTop3, beautifulTop3, woodenTop3 }, specialPrizes) {
  const container = document.getElementById('predictions-container');
  if (!container) return;

  const spMap = {};
  specialPrizes.forEach(p => { spMap[p.type] = p; });

  function rankRow(i, left, right, subLeft='', subRight='', locked=false) {
    const num  = String(i+1).padStart(2,'0');
    const cls  = i===0 ? (locked ? 'pred-row--locked' : 'pred-row--leader') : '';
    const icon = i===0 && !locked ? '<span class="pred-leader-dot"></span>' : '';
    return `<div class="pred-row ${cls}">
      <span class="pred-rank">${num}</span>
      <div class="pred-info">
        <span class="pred-main">${icon}${left}</span>
        ${subLeft ? `<span class="pred-sub">${subLeft}</span>` : ''}
      </div>
      <div class="pred-stat">
        <span class="pred-val">${right}</span>
        ${subRight ? `<span class="pred-sub">${subRight}</span>` : ''}
      </div>
    </div>`;
  }

  // Underdog Hero
  const uhLocked = !!spMap['underdog_hero'];
  const uhTitle  = uhLocked ? '🦁 UNDERDOG HERO <span class="pred-locked-tag">LOCKED</span>' : '🦁 UNDERDOG HERO';
  const t3anyAlive = underdogTop3.some(e => !e.eliminated);
  const uhRows   = underdogTop3.length
    ? underdogTop3.map((e,i) => {
        const gdStr  = e.gd > 0 ? `+${e.gd}` : `${e.gd}`;
        const player = e.player?.name?.toUpperCase() || '—';
        const tag    = !t3anyAlive ? ' <span style="color:var(--yellow);font-size:.7em">LAST OUT</span>' : '';
        return rankRow(i, `${e.team.flag} ${e.team.name.toUpperCase()}${tag}`, `${e.wins}W`, player, `GD ${gdStr}`, uhLocked);
      }).join('')
    : '<p class="pred-empty">Waiting for kick-off...</p>';

  // Beautiful Loser
  const blLocked = !!spMap['beautiful_loser'];
  const blTitle  = blLocked ? '💐 BEAUTIFUL LOSER <span class="pred-locked-tag">LOCKED</span>' : '💐 BEAUTIFUL LOSER';
  const blPredicted = beautifulTop3[0]?.predicted;
  const blRows   = beautifulTop3.length
    ? beautifulTop3.map((e,i) => {
        const player = e.player?.name?.toUpperCase() || '—';
        const sub = e.predicted ? `${e.wins}W · ${e.gpg}/game` : `${e.gpg}/game`;
        return rankRow(i, `${e.team.flag} ${e.team.name.toUpperCase()}`, `${e.goals}G`, player, sub, blLocked);
      }).join('')
    : '<p class="pred-empty">Waiting for kick-off...</p>';

  // Wooden Spoon
  const wsLocked   = !!spMap['wooden_spoon'];
  const wsTitle    = wsLocked ? '🥄 WOODEN SPOON <span class="pred-locked-tag">LOCKED</span>' : '🥄 WOODEN SPOON';
  const wsPredicted = woodenTop3[0]?.predicted;
  const wsRows     = woodenTop3.length
    ? woodenTop3.map((e,i) => {
        return rankRow(i, e.player.name.toUpperCase(), `${e.conceded} GA`, e.detail, 'goals against', wsLocked);
      }).join('')
    : '<p class="pred-empty">Waiting for group stage data...</p>';

  container.innerHTML = `
    <div class="pred-grid">
      <div class="pred-card">
        <div class="pred-header">${uhTitle}<span class="pred-prize">€20</span></div>
        <div class="pred-subtitle">Last Tier 3 team standing — ranked by round reached, then wins</div>
        ${uhRows}
      </div>
      <div class="pred-card">
        <div class="pred-header">${blTitle}<span class="pred-prize">€15</span></div>
        <div class="pred-subtitle">${blPredicted ? 'Most goals, fewest wins — likely exits' : 'Most group stage goals — eliminated teams only'}</div>
        ${blRows}
      </div>
      <div class="pred-card">
        <div class="pred-header">${wsTitle}<span class="pred-prize">€5</span></div>
        <div class="pred-subtitle">${wsPredicted ? 'Running total — group stage in progress' : 'Combined goals conceded across all 3 teams, group stage'}</div>
        ${wsRows}
      </div>
    </div>`;
}

// ─── Prize panel ──────────────────────────────────────────────────────
function renderPrizePanel(prizes) {
  const defs = [
    { type:'winner',         name:'Tournament winner',  desc:'Team lifts the trophy',          amt:120 },
    { type:'runner_up',      name:'Runner-up',          desc:'Team reaches the final',         amt:50  },
    { type:'semi_finalist',  name:'Semi-final split',   desc:'Both SF losers — €15 each',      amt:15  },
    { type:'underdog_hero',  name:'Underdog hero',      desc:'Last Tier 3 team still alive',   amt:20  },
    { type:'beautiful_loser',name:'Beautiful loser',    desc:'Most goals by group stage exit', amt:15  },
    { type:'wooden_spoon',   name:'Wooden spoon',       desc:'Most goals conceded, all 3',     amt:5   },
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
  const rows  = document.querySelectorAll('.lb-row');
  const lines = ['⚽ WC2026 SWEEPSTAKES ⚽', ''];
  let i = 0;
  rows.forEach(row => {
    if (i++ >= 5) return;
    const rank  = row.querySelector('.lb-rank')?.textContent || '';
    const name  = row.querySelector('.lb-name')?.textContent || '';
    const stat  = row.querySelector('[style*="text-align:right"]')?.textContent?.trim() || '';
    lines.push(`${rank} ${name} — ${stat}`);
  });
  lines.push('', `🔴 LIVE: ${location.href}`);
  window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-btn').addEventListener('click', () => refresh(true));
  document.getElementById('whatsapp-btn').addEventListener('click', shareWhatsApp);
  initLeaderboard();
});
