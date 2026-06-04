// Draw page logic

let wheel;
let players = [];
let assignments = [];
let drawOrder = []; // [{ player, tier }] for each remaining spin
let currentStepIndex = 0;
let adminAuthed = false;

async function initDraw() {
  const canvas = document.getElementById('wheel-canvas');
  wheel = new SpinWheel(canvas);

  await loadDrawState();
  renderProgress();
  renderLog();
  updateSpinBtn();
}

async function loadDrawState() {
  try {
    players = await DB.getPlayers();
    assignments = await DB.getAssignments();
  } catch (e) {
    showError('Database error: ' + e.message);
    return;
  }

  if (!players.length) {
    showStatus('No players set up yet. Ask the admin to add players first.', 'warn');
    return;
  }

  // Build remaining draw order
  // For each player × tier, check if already assigned
  const assigned = new Set(assignments.map(a => `${a.player_id}_${a.tier}`));
  drawOrder = [];

  players.forEach(player => {
    [1, 2, 3].forEach(tier => {
      if (!assigned.has(`${player.id}_${tier}`)) {
        drawOrder.push({ player, tier });
      }
    });
  });

  currentStepIndex = 0; // always start from first unfinished step

  if (drawOrder.length === 0) {
    showStatus('The draw is complete! 🎉 Check the <a href="index.html">leaderboard</a>.', 'success');
    setWheelIdle();
  } else {
    loadWheelForCurrentStep();
  }
}

function getAssignedTeamsForTier(tier) {
  return assignments
    .filter(a => a.tier === tier)
    .map(a => a.team_id);
}

function getRemainingTeams(tier) {
  const used = new Set(getAssignedTeamsForTier(tier));
  return getTierTeams(tier).filter(t => !used.has(t.id));
}

function loadWheelForCurrentStep() {
  if (currentStepIndex >= drawOrder.length) return;
  const { tier } = drawOrder[currentStepIndex];
  const remaining = getRemainingTeams(tier);
  wheel.setTeams(remaining);
}

function setWheelIdle() {
  wheel.setTeams([]);
}

function renderProgress() {
  const total = players.length * 3;
  const done = assignments.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = `${done} / ${total} teams assigned`;

  if (currentStepIndex < drawOrder.length) {
    const { player, tier } = drawOrder[currentStepIndex];
    document.getElementById('current-player').textContent = player.name;
    document.getElementById('current-tier').textContent = `Tier ${tier} (${tierLabel(tier)})`;
    document.getElementById('current-info').style.display = 'block';
  } else {
    document.getElementById('current-info').style.display = 'none';
  }
}

function renderLog() {
  const log = document.getElementById('draw-log');
  if (!players.length) { log.innerHTML = '<p class="muted">No players yet.</p>'; return; }

  const byPlayer = {};
  players.forEach(p => { byPlayer[p.id] = { name: p.name, teams: {} }; });
  assignments.forEach(a => {
    if (byPlayer[a.player_id]) {
      byPlayer[a.player_id].teams[a.tier] = getTeam(a.team_id);
    }
  });

  log.innerHTML = players.map(p => {
    const data = byPlayer[p.id];
    const chips = [1, 2, 3].map(tier => {
      const t = data.teams[tier];
      if (!t) return `<span class="chip chip--empty">T${tier}: ?</span>`;
      return `<span class="chip chip--t${tier}">${t.flag} ${t.name}</span>`;
    }).join('');
    const isDone = [1,2,3].every(tier => data.teams[tier]);
    return `
      <div class="log-row ${isDone ? 'log-row--done' : ''}">
        <strong>${p.name}</strong>
        <div class="chips">${chips}</div>
      </div>`;
  }).join('');
}

function updateSpinBtn() {
  const btn = document.getElementById('spin-btn');
  const authRow = document.getElementById('auth-row');

  if (!adminAuthed) {
    authRow.style.display = 'flex';
    btn.style.display = 'none';
    return;
  }
  authRow.style.display = 'none';
  btn.style.display = 'block';
  btn.disabled = currentStepIndex >= drawOrder.length || wheel.spinning;
  btn.textContent = currentStepIndex >= drawOrder.length ? 'Draw Complete!' : 'SPIN!';
}

async function doSpin() {
  if (currentStepIndex >= drawOrder.length) return;
  const { player, tier } = drawOrder[currentStepIndex];
  const remaining = getRemainingTeams(tier);

  if (!remaining.length) {
    showError('No remaining teams for tier ' + tier);
    return;
  }

  // Pick random team before animating
  const targetIndex = Math.floor(Math.random() * remaining.length);
  const chosenTeam = remaining[targetIndex];

  // Save to DB immediately (before animation, so data is safe on refresh)
  try {
    await DB.saveAssignment(player.id, chosenTeam.id, tier);
  } catch (e) {
    showError('Failed to save assignment: ' + e.message);
    return;
  }

  assignments.push({ player_id: player.id, team_id: chosenTeam.id, tier, players: { name: player.name } });

  document.getElementById('spin-btn').disabled = true;
  await wheel.spin(targetIndex);

  // Show result banner
  showResult(`${player.name} gets ${chosenTeam.flag} ${chosenTeam.name}!`);

  currentStepIndex++;

  // Brief pause then load next
  await sleep(1800);
  clearResult();

  if (currentStepIndex < drawOrder.length) {
    loadWheelForCurrentStep();
  } else {
    await DB.setSetting('draw_complete', 'true');
    setWheelIdle();
  }

  renderProgress();
  renderLog();
  updateSpinBtn();
}

function checkAdminAuth() {
  const input = document.getElementById('admin-pwd-input');
  if (input.value === CONFIG.ADMIN_PASSWORD) {
    adminAuthed = true;
    updateSpinBtn();
  } else {
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 500);
    input.value = '';
  }
}

// --- helpers ---
function tierLabel(tier) {
  return ['', 'Strong', 'Mid-tier', 'Underdog'][tier];
}

function showStatus(html, type = 'info') {
  const el = document.getElementById('status-msg');
  el.innerHTML = html;
  el.className = `status-msg status-msg--${type}`;
  el.style.display = 'block';
}

function showError(msg) { showStatus(msg, 'error'); }

function showResult(msg) {
  const el = document.getElementById('result-banner');
  el.textContent = msg;
  el.classList.add('visible');
}

function clearResult() {
  document.getElementById('result-banner').classList.remove('visible');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// WhatsApp share link for live watching
document.addEventListener('DOMContentLoaded', () => {
  const shareBtn = document.getElementById('share-draw-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const url = encodeURIComponent(window.location.href);
      const msg = encodeURIComponent('Watch the WC2026 sweepstakes draw live! 🎰⚽');
      window.open(`https://wa.me/?text=${msg}%20${url}`, '_blank');
    });
  }

  document.getElementById('admin-auth-btn').addEventListener('click', checkAdminAuth);
  document.getElementById('admin-pwd-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') checkAdminAuth();
  });
  document.getElementById('spin-btn').addEventListener('click', doSpin);

  initDraw();
});
