// Prize calculation engine

const STAGE_LABEL = {
  GROUP_STAGE: 'Group Stage',
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-Final',
  SEMI_FINALS: 'Semi-Final',
  FINAL: 'Final',
  THIRD_PLACE: '3rd Place',
};

function computeTeamStatus(matches) {
  // Returns { [teamId]: { eliminated: bool, stage: string, round: string } }
  const status = {};

  const finished = matches.filter(m => m.status === 'FINISHED');

  // Knockout losers are eliminated
  const knockoutStages = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL', 'THIRD_PLACE'];
  finished
    .filter(m => knockoutStages.includes(m.stage) && m.score.winner)
    .forEach(match => {
      const loserId = match.score.winner === 'HOME_TEAM' ? match.awayTeam.id : match.homeTeam.id;
      const winnerId = match.score.winner === 'HOME_TEAM' ? match.homeTeam.id : match.awayTeam.id;

      if (!status[loserId]) {
        status[loserId] = { eliminated: true, stage: match.stage, round: STAGE_LABEL[match.stage] };
      }
      if (!status[winnerId] || !status[winnerId].eliminated) {
        status[winnerId] = { eliminated: false, stage: match.stage, round: STAGE_LABEL[match.stage] };
      }
    });

  // Group stage eliminations: teams not appearing in LAST_32 were knocked out in groups
  const teamsInLast32 = new Set();
  matches
    .filter(m => m.stage === 'LAST_32')
    .forEach(m => {
      teamsInLast32.add(m.homeTeam.id);
      teamsInLast32.add(m.awayTeam.id);
    });

  const last32Exists = matches.some(m => m.stage === 'LAST_32');
  if (last32Exists) {
    const groupTeams = new Set();
    matches
      .filter(m => m.stage === 'GROUP_STAGE')
      .forEach(m => {
        groupTeams.add(m.homeTeam.id);
        groupTeams.add(m.awayTeam.id);
      });
    groupTeams.forEach(id => {
      if (!teamsInLast32.has(id) && !status[id]) {
        status[id] = { eliminated: true, stage: 'GROUP_STAGE', round: 'Group Stage' };
      }
    });
  }

  return status;
}

function computeGroupGoals(matches) {
  // Returns { [teamId]: { scored: number, conceded: number } }
  const goals = {};
  matches
    .filter(m => m.stage === 'GROUP_STAGE' && m.status === 'FINISHED')
    .forEach(m => {
      const h = m.score.fullTime.home ?? 0;
      const a = m.score.fullTime.away ?? 0;
      if (!goals[m.homeTeam.id]) goals[m.homeTeam.id] = { scored: 0, conceded: 0 };
      if (!goals[m.awayTeam.id]) goals[m.awayTeam.id] = { scored: 0, conceded: 0 };
      goals[m.homeTeam.id].scored += h;
      goals[m.homeTeam.id].conceded += a;
      goals[m.awayTeam.id].scored += a;
      goals[m.awayTeam.id].conceded += h;
    });
  return goals;
}

// Build player data from raw assignments rows
function buildPlayerMap(assignments) {
  const map = {};
  assignments.forEach(a => {
    const pid = a.player_id;
    if (!map[pid]) {
      map[pid] = { id: pid, name: a.players?.name || `Player ${pid}`, teams: {} };
    }
    map[pid].teams[a.tier] = a.team_id;
  });
  return map;
}

function findPlayerByTeam(teamId, playerMap) {
  for (const p of Object.values(playerMap)) {
    if (Object.values(p.teams).includes(teamId)) return p;
  }
  return null;
}

function computePrizes(matches, assignments, specialPrizes = []) {
  const teamStatus = computeTeamStatus(matches);
  const groupGoals = computeGroupGoals(matches);
  const playerMap = buildPlayerMap(assignments);
  const results = [];

  const spOf = type => specialPrizes.find(p => p.type === type) || null;

  // --- Tournament Winner €120 ---
  const finalMatch = matches.find(m => m.stage === 'FINAL' && m.status === 'FINISHED' && m.score.winner);
  if (finalMatch) {
    const winnerId = finalMatch.score.winner === 'HOME_TEAM' ? finalMatch.homeTeam.id : finalMatch.awayTeam.id;
    const loserId  = finalMatch.score.winner === 'HOME_TEAM' ? finalMatch.awayTeam.id  : finalMatch.homeTeam.id;
    const wp = findPlayerByTeam(winnerId, playerMap);
    const lp = findPlayerByTeam(loserId, playerMap);
    if (wp) results.push({ type: 'winner',    label: 'Tournament Winner', amount: 120, player: wp, teamId: winnerId, status: 'locked' });
    if (lp) results.push({ type: 'runner_up', label: 'Runner-Up',         amount: 50,  player: lp, teamId: loserId,  status: 'locked' });
  }

  // --- Semi-Final Losers €15 each ---
  matches
    .filter(m => m.stage === 'SEMI_FINALS' && m.status === 'FINISHED' && m.score.winner)
    .forEach(m => {
      const loserId = m.score.winner === 'HOME_TEAM' ? m.awayTeam.id : m.homeTeam.id;
      const p = findPlayerByTeam(loserId, playerMap);
      if (p) results.push({ type: 'semi_finalist', label: 'Semi-Finalist', amount: 15, player: p, teamId: loserId, status: 'locked' });
    });

  // --- Underdog Hero €20 (last Tier 3 team still alive) ---
  const spUH = spOf('underdog_hero');
  if (spUH) {
    const p = playerMap[spUH.player_id];
    if (p) results.push({ type: 'underdog_hero', label: 'Underdog Hero', amount: 20, player: p, status: 'locked' });
  } else {
    const t3alive = TEAMS.tier3.map(t => t.id).filter(id => !teamStatus[id]?.eliminated);
    if (t3alive.length === 1) {
      const p = findPlayerByTeam(t3alive[0], playerMap);
      if (p) results.push({ type: 'underdog_hero', label: 'Underdog Hero 👀', amount: 20, player: p, teamId: t3alive[0], status: 'pending' });
    }
  }

  // --- Beautiful Loser €15 (most goals by a group-stage-only team) ---
  const spBL = spOf('beautiful_loser');
  const last32Started = matches.some(m => m.stage === 'LAST_32');
  if (spBL) {
    const p = playerMap[spBL.player_id];
    if (p) results.push({ type: 'beautiful_loser', label: 'Beautiful Loser', amount: 15, player: p, status: 'locked' });
  } else if (last32Started) {
    let best = null, bestGoals = -1;
    Object.entries(teamStatus)
      .filter(([, s]) => s.eliminated && s.stage === 'GROUP_STAGE')
      .forEach(([idStr]) => {
        const id = parseInt(idStr);
        const g = groupGoals[id]?.scored ?? 0;
        if (g > bestGoals) { bestGoals = g; best = id; }
      });
    if (best) {
      const p = findPlayerByTeam(best, playerMap);
      if (p) results.push({ type: 'beautiful_loser', label: 'Beautiful Loser', amount: 15, player: p, teamId: best, status: 'computed', goals: bestGoals });
    }
  }

  // --- Wooden Spoon €5 (most goals conceded across all 3 teams in group stage) ---
  const spWS = spOf('wooden_spoon');
  if (spWS) {
    const p = playerMap[spWS.player_id];
    if (p) results.push({ type: 'wooden_spoon', label: 'Wooden Spoon', amount: 5, player: p, status: 'locked' });
  } else if (last32Started) {
    let worst = null, mostConceded = -1;
    Object.values(playerMap).forEach(p => {
      const total = Object.values(p.teams).reduce((sum, tid) => sum + (groupGoals[tid]?.conceded ?? 0), 0);
      if (total > mostConceded) { mostConceded = total; worst = p; }
    });
    if (worst) results.push({ type: 'wooden_spoon', label: 'Wooden Spoon', amount: 5, player: worst, status: 'computed', conceded: mostConceded });
  }

  return { prizes: results, teamStatus, groupGoals, playerMap };
}

// Prize totals per player
function playerPrizeTotals(prizes) {
  const totals = {};
  prizes.forEach(p => {
    const id = p.player.id;
    if (!totals[id]) totals[id] = { locked: 0, pending: 0 };
    if (p.status === 'locked') totals[id].locked += p.amount;
    else if (p.status === 'pending' || p.status === 'computed') totals[id].pending += p.amount;
  });
  return totals;
}
