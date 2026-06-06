// Prize calculation + points scoring engine

const STAGE_LABEL = {
  GROUP_STAGE:    'Group Stage',
  LAST_32:        'Round of 32',
  LAST_16:        'Round of 16',
  QUARTER_FINALS: 'Quarter-Final',
  SEMI_FINALS:    'Semi-Final',
  FINAL:          'Final',
  THIRD_PLACE:    '3rd Place',
};

// Points awarded per event
const PTS = {
  group_win:    100,
  group_draw:    50,
  group_advance: 200,
  win_r32:       300,
  win_r16:       400,
  win_qf:        500,
  win_sf:        600,
  win_final:    1000,
};

function computeTeamStatus(matches) {
  const status = {};
  const finished = matches.filter(m => m.status === 'FINISHED');

  const knockoutStages = ['LAST_32','LAST_16','QUARTER_FINALS','SEMI_FINALS','FINAL','THIRD_PLACE'];
  finished
    .filter(m => knockoutStages.includes(m.stage) && m.score?.winner)
    .forEach(match => {
      const loserId   = match.score.winner === 'HOME_TEAM' ? match.awayTeam.id : match.homeTeam.id;
      const winnerId  = match.score.winner === 'HOME_TEAM' ? match.homeTeam.id : match.awayTeam.id;
      if (!status[loserId])  status[loserId]  = { eliminated: true,  stage: match.stage, round: STAGE_LABEL[match.stage] };
      if (!status[winnerId] || !status[winnerId].eliminated)
        status[winnerId] = { eliminated: false, stage: match.stage, round: STAGE_LABEL[match.stage] };
    });

  const teamsInLast32 = new Set();
  matches.filter(m => m.stage === 'LAST_32').forEach(m => {
    teamsInLast32.add(m.homeTeam.id);
    teamsInLast32.add(m.awayTeam.id);
  });
  const last32Exists = matches.some(m => m.stage === 'LAST_32' && ['FINISHED','IN_PLAY','PAUSED'].includes(m.status));
  if (last32Exists) {
    const groupTeams = new Set();
    matches.filter(m => m.stage === 'GROUP_STAGE').forEach(m => {
      groupTeams.add(m.homeTeam.id);
      groupTeams.add(m.awayTeam.id);
    });
    groupTeams.forEach(id => {
      if (!teamsInLast32.has(id) && !status[id])
        status[id] = { eliminated: true, stage: 'GROUP_STAGE', round: 'Group Stage' };
    });
  }
  return status;
}

function computeGroupGoals(matches) {
  const goals = {};
  matches
    .filter(m => m.stage === 'GROUP_STAGE' && m.status === 'FINISHED')
    .forEach(m => {
      const h = m.score.fullTime.home ?? 0;
      const a = m.score.fullTime.away ?? 0;
      if (!goals[m.homeTeam.id]) goals[m.homeTeam.id] = { scored: 0, conceded: 0 };
      if (!goals[m.awayTeam.id]) goals[m.awayTeam.id] = { scored: 0, conceded: 0 };
      goals[m.homeTeam.id].scored   += h; goals[m.homeTeam.id].conceded += a;
      goals[m.awayTeam.id].scored   += a; goals[m.awayTeam.id].conceded += h;
    });
  return goals;
}

function buildPlayerMap(assignments) {
  const map = {};
  assignments.forEach(a => {
    const pid = a.player_id;
    if (!map[pid]) map[pid] = { id: pid, name: a.players?.name || `Player ${pid}`, teams: {} };
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

function computePlayerPoints(matches, playerMap) {
  const teamPts = {};

  // Group stage wins/draws
  matches
    .filter(m => m.stage === 'GROUP_STAGE' && m.status === 'FINISHED')
    .forEach(m => {
      const h = m.homeTeam.id, a = m.awayTeam.id;
      if (!teamPts[h]) teamPts[h] = 0;
      if (!teamPts[a]) teamPts[a] = 0;
      if (m.score.winner === 'HOME_TEAM')      { teamPts[h] += PTS.group_win; }
      else if (m.score.winner === 'AWAY_TEAM') { teamPts[a] += PTS.group_win; }
      else if (m.score.winner === 'DRAW')      { teamPts[h] += PTS.group_draw; teamPts[a] += PTS.group_draw; }
    });

  // Group stage advance bonus
  const teamsInR32 = new Set();
  matches.filter(m => m.stage === 'LAST_32').forEach(m => {
    teamsInR32.add(m.homeTeam.id);
    teamsInR32.add(m.awayTeam.id);
  });
  teamsInR32.forEach(id => { if (!teamPts[id]) teamPts[id] = 0; teamPts[id] += PTS.group_advance; });

  // Knockout wins
  const koPts = { LAST_32: PTS.win_r32, LAST_16: PTS.win_r16, QUARTER_FINALS: PTS.win_qf, SEMI_FINALS: PTS.win_sf, FINAL: PTS.win_final };
  matches
    .filter(m => koPts[m.stage] && m.status === 'FINISHED' && m.score.winner)
    .forEach(m => {
      const wid = m.score.winner === 'HOME_TEAM' ? m.homeTeam.id : m.awayTeam.id;
      if (!teamPts[wid]) teamPts[wid] = 0;
      teamPts[wid] += koPts[m.stage];
    });

  // Sum per player
  const playerPts = {};
  Object.values(playerMap).forEach(p => {
    playerPts[p.id] = Object.values(p.teams).reduce((s, tid) => s + (teamPts[tid] || 0), 0);
  });
  return { playerPts, teamPts };
}

function computePrizes(matches, assignments, specialPrizes = []) {
  const teamStatus = computeTeamStatus(matches);
  const groupGoals = computeGroupGoals(matches);
  const playerMap  = buildPlayerMap(assignments);
  const results    = [];
  const spOf = type => specialPrizes.find(p => p.type === type) || null;

  // Tournament winner €120
  const finalMatch = matches.find(m => m.stage === 'FINAL' && m.status === 'FINISHED' && m.score.winner);
  if (finalMatch) {
    const wid = finalMatch.score.winner === 'HOME_TEAM' ? finalMatch.homeTeam.id : finalMatch.awayTeam.id;
    const lid = finalMatch.score.winner === 'HOME_TEAM' ? finalMatch.awayTeam.id  : finalMatch.homeTeam.id;
    const wp = findPlayerByTeam(wid, playerMap);
    const lp = findPlayerByTeam(lid, playerMap);
    if (wp) results.push({ type:'winner',    label:'WINNER',    amount:120, player:wp, teamId:wid, status:'locked' });
    if (lp) results.push({ type:'runner_up', label:'RUNNER-UP', amount:50,  player:lp, teamId:lid, status:'locked' });
  }

  // Semi-final losers €15
  matches
    .filter(m => m.stage === 'SEMI_FINALS' && m.status === 'FINISHED' && m.score.winner)
    .forEach(m => {
      const lid = m.score.winner === 'HOME_TEAM' ? m.awayTeam.id : m.homeTeam.id;
      const p = findPlayerByTeam(lid, playerMap);
      if (p) results.push({ type:'semi_finalist', label:'SF', amount:15, player:p, teamId:lid, status:'locked' });
    });

  // Underdog hero €20
  const spUH = spOf('underdog_hero');
  if (spUH) {
    const p = playerMap[spUH.player_id];
    if (p) results.push({ type:'underdog_hero', label:'UNDERDOG', amount:20, player:p, status:'locked' });
  } else {
    const t3alive = TEAMS.tier3.map(t => t.id).filter(id => !teamStatus[id]?.eliminated);
    if (t3alive.length === 1) {
      const p = findPlayerByTeam(t3alive[0], playerMap);
      if (p) results.push({ type:'underdog_hero', label:'UNDERDOG 👀', amount:20, player:p, teamId:t3alive[0], status:'pending' });
    }
  }

  // Beautiful loser €15
  const spBL = spOf('beautiful_loser');
  const last32Started = matches.some(m => m.stage === 'LAST_32' && ['FINISHED','IN_PLAY','PAUSED'].includes(m.status));
  if (spBL) {
    const p = playerMap[spBL.player_id];
    if (p) results.push({ type:'beautiful_loser', label:'BEAUTIFUL', amount:15, player:p, status:'locked' });
  } else if (last32Started) {
    let best = null, bestGoals = -1;
    Object.entries(teamStatus)
      .filter(([,s]) => s.eliminated && s.stage === 'GROUP_STAGE')
      .forEach(([idStr]) => {
        const id = parseInt(idStr);
        const g = groupGoals[id]?.scored ?? 0;
        if (g > bestGoals) { bestGoals = g; best = id; }
      });
    if (best) {
      const p = findPlayerByTeam(best, playerMap);
      if (p) results.push({ type:'beautiful_loser', label:'BEAUTIFUL', amount:15, player:p, teamId:best, status:'computed', goals:bestGoals });
    }
  }

  // Wooden spoon €5
  const spWS = spOf('wooden_spoon');
  if (spWS) {
    const p = playerMap[spWS.player_id];
    if (p) results.push({ type:'wooden_spoon', label:'SPOON', amount:5, player:p, status:'locked' });
  } else if (last32Started) {
    let worst = null, mostConceded = -1;
    Object.values(playerMap).forEach(p => {
      const total = Object.values(p.teams).reduce((s, tid) => s + (groupGoals[tid]?.conceded ?? 0), 0);
      if (total > mostConceded) { mostConceded = total; worst = p; }
    });
    if (worst) results.push({ type:'wooden_spoon', label:'SPOON', amount:5, player:worst, status:'computed', conceded:mostConceded });
  }

  return { prizes: results, teamStatus, groupGoals, playerMap };
}

function playerPrizeTotals(prizes) {
  const totals = {};
  prizes.forEach(p => {
    const id = p.player.id;
    if (!totals[id]) totals[id] = { locked: 0, pending: 0 };
    if (p.status === 'locked') totals[id].locked += p.amount;
    else totals[id].pending += p.amount;
  });
  return totals;
}
