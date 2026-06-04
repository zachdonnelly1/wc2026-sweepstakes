// Draw page logic

let wheel;
let players = [];
let assignments = [];
let drawOrder = [];
let currentStepIndex = 0;
let adminAuthed = false;

// Web Audio beep on landing
function playLandingBeep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (_) { /* audio not supported */ }
}

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
    players     = await DB.getPlayers();
    assignments = await DB.getAssignments();
  } catch (e) {
    showStatus('Database error: ' + e.message, 'error');
    return;
  }

  if (!players.length) {
    showStatus('No players set up yet. Ask the admin to add players first.', 'warn');
    return;
  }

  const assigned = new Set(assignments.map(a => `${a.player_id}_${a.tier}`));
  drawOrder = [];
  players.forEach(player => {
    [1, 2, 3].forEach(tier => {
      if (!assigned.has(`${player.id}_${tier}`)) drawOrder.push({ player, tier });
    });
  });
  currentStepIndex = 0;

  if (drawOrder.length === 0) {
    showStatus('DRAW COMPLETE — <a href="index.html">VIEW LEADERBOARD</a>', 'success');
    setWheelIdle();
  } else {
    loadWheelForCurrentStep();
  }
}

function getAssignedTeamsForTier(tier) {
  return assignments.filter(a => a.tier === tier).map(a => a.team_id);
}

function getRemainingTeams(tier) {
  const used = new Set(getAssignedTeamsForTier(tier));
  return getTierTeams(tier).filter(t => !used.has(t.id));
}

function loadWheelForCurrentStep() {
  if (currentStepIndex >= drawOrder.length) return;
  const { tier } = drawOrder[currentStepIndex];
  wheel.setTeams(getRemainingTeams(tier));
}

function setWheelIdle() { wheel.setTeams([]); }

function renderProgress() {
  const total = players.length * 3;
  const done  = assignments.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = `${done} / ${total} TEAMS ASSIGNED`;

  if (currentStepIndex < drawOrder.length) {
    const { player, tier } = drawOrder[currentStepIndex];
    document.getElementById('current-player').textContent = player.name.toUpperCase();
    document.getElementById('current-tier').textContent   = `TIER ${tier} — ${tierLabel(tier).toUpperCase()}`;
    document.getElementById('current-tier').className     = `tier-tag tier-tag--${tier}`;
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
    if (byPlayer[a.player_id]) byPlayer[a.player_id].teams[a.tier] = getTeam(a.team_id);
  });

  log.innerHTML = players.map(p => {
    const data  = byPlayer[p.id];
    const chips = [1, 2, 3].map(tier => {
      const t = data.teams[tier];
      if (!t) return `<span class="chip chip--empty">T${tier}:?</span>`;
      return `<span class="chip chip--t${tier}">${t.flag} ${t.tla}</span>`;
    }).join('');
    const done = [1,2,3].every(tier => data.teams[tier]);
    return `<div class="log-row ${done ? 'log-row--done' : ''}">
      <strong>${p.name.toUpperCase()}</strong>
      <div class="chips">${chips}</div>
    </div>`;
  }).join('');
}

function updateSpinBtn() {
  const btn     = document.getElementById('spin-btn');
  const authRow = document.getElementById('auth-row');
  const waiting = document.getElementById('waiting-msg');

  if (!adminAuthed) {
    authRow.style.display = 'flex';
    btn.style.display     = 'none';
    if (waiting) waiting.style.display = 'block';
    return;
  }
  authRow.style.display = 'none';
  if (waiting) waiting.style.display = 'none';
  btn.style.display     = 'block';
  btn.disabled = currentStepIndex >= drawOrder.length || wheel.spinning;
  btn.textContent = currentStepIndex >= drawOrder.length ? 'DRAW COMPLETE' : 'SPIN!';
}

async function doSpin() {
  if (currentStepIndex >= drawOrder.length) return;
  const { player, tier } = drawOrder[currentStepIndex];
  const remaining = getRemainingTeams(tier);
  if (!remaining.length) { showStatus('No remaining teams for tier ' + tier, 'error'); return; }

  const targetIndex = Math.floor(Math.random() * remaining.length);
  const chosen      = remaining[targetIndex];

  try {
    await DB.saveAssignment(player.id, chosen.id, tier);
  } catch (e) {
    showStatus('Failed to save: ' + e.message, 'error');
    return;
  }
  assignments.push({ player_id: player.id, team_id: chosen.id, tier, players: { name: player.name } });

  document.getElementById('spin-btn').disabled = true;
  await wheel.spin(targetIndex);
  playLandingBeep();

  showResult(`${player.name.toUpperCase()} GETS ${chosen.flag} ${chosen.name.toUpperCase()}!`);
  currentStepIndex++;

  await sleep(2000);
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

// ─── helpers ─────────────────────────────────────────────────────────
function tierLabel(tier) { return ['', 'Strong', 'Mid-Tier', 'Underdog'][tier]; }

function showStatus(html, type = 'info') {
  const el = document.getElementById('status-msg');
  el.innerHTML = html;
  el.className = `status-msg status-msg--${type}`;
  el.style.display = 'block';
}

function showResult(msg) {
  const el = document.getElementById('result-banner');
  el.textContent = msg;
  el.classList.add('visible');
}

function clearResult() {
  document.getElementById('result-banner').classList.remove('visible');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('share-draw-btn').addEventListener('click', () => {
    const msg = encodeURIComponent('Watch the WC2026 sweepstakes draw LIVE 🎰⚽ ');
    const url = encodeURIComponent(window.location.href);
    window.open(`https://wa.me/?text=${msg}${url}`, '_blank');
  });
  document.getElementById('admin-auth-btn').addEventListener('click', checkAdminAuth);
  document.getElementById('admin-pwd-input').addEventListener('keydown', e => { if (e.key === 'Enter') checkAdminAuth(); });
  document.getElementById('spin-btn').addEventListener('click', doSpin);
  initDraw();
});
