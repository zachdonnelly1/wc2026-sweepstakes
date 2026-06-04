// Draw page — slot machine, player tokens, admin mode

// Token system: token = `{playerId}-{btoa(playerId:adminPassword)}`
function generateToken(playerId) {
  const hash = btoa(`${playerId}:${CONFIG.ADMIN_PASSWORD}`).replace(/=/g, '');
  return `${playerId}-${hash}`;
}
function validateToken(token) {
  if (!token) return null;
  const dashIdx = token.indexOf('-');
  if (dashIdx < 0) return null;
  const playerId = parseInt(token.slice(0, dashIdx));
  if (isNaN(playerId)) return null;
  return token === generateToken(playerId) ? playerId : null;
}

// ─── Slot Machine ────────────────────────────────────────────────────
class SlotMachine {
  constructor(viewport) {
    this.viewport = viewport;
    this.reel     = viewport.querySelector('.slot-reel');
    this.spinning  = false;
  }

  setIdleTeams(teams) {
    // Show first few teams cycling as idle state
    const display = teams.length >= 3
      ? [teams[teams.length - 1], teams[0], teams[1]]
      : teams;
    this._buildReel(display, 1);
  }

  async spin(allTeams, targetTeam) {
    if (this.spinning) return;
    this.spinning = true;

    const ITEM_H  = 60;
    const REPEATS = 18;

    // Build a long strip: many shuffled copies + target at end
    const strip = [];
    for (let i = 0; i < REPEATS; i++) {
      const shuffled = [...allTeams].sort(() => Math.random() - 0.5);
      strip.push(...shuffled);
    }
    strip.push(targetTeam);

    this._buildReel(strip, strip.length - 1);

    // Position reel so first item is visible (top)
    this.reel.style.transition = 'none';
    this.reel.style.transform  = 'translateY(0)';

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Animate to center the target item (index: strip.length - 1)
    // Center item offset = -(targetIndex * ITEM_H) + ITEM_H  (viewport shows 3 items, center is index 1)
    const targetY = -((strip.length - 1) * ITEM_H) + ITEM_H;
    this.reel.style.transition = `transform 3.6s cubic-bezier(0.12, 0, 0.06, 1)`;
    this.reel.style.transform  = `translateY(${targetY}px)`;

    await sleep(3700);

    // Rebuild with just the landing context
    const idx = strip.length - 1;
    const ctx = [strip[Math.max(0, idx - 1)], strip[idx], strip[Math.min(strip.length - 1, idx + 1)]];
    this._buildReel(ctx, 1);
    this.reel.style.transition = 'none';
    this.reel.style.transform  = 'translateY(-' + ITEM_H + 'px)';

    this.spinning = false;
    return targetTeam;
  }

  _buildReel(teams, activeIndex) {
    this.reel.style.transition = 'none';
    this.reel.style.transform  = `translateY(-${activeIndex === 1 ? 60 : 0}px)`;
    this.reel.innerHTML = teams.map((t, i) =>
      `<div class="slot-item ${i === activeIndex ? 'slot-item--active' : ''}">
        <span class="flag">${t.flag}</span>
        <span>${t.name}</span>
      </div>`
    ).join('');
  }
}

function makeSlotHTML(tierId) {
  const labels = { 1: ['t1', 'TIER 1 — STRONG'], 2: ['t2', 'TIER 2 — MID'], 3: ['t3', 'TIER 3 — UNDERDOG'] };
  const [cls, text] = labels[tierId];
  return `<div class="slot-column" id="slot-col-${tierId}">
    <span class="slot-label slot-label--${cls}">${text}</span>
    <div class="slot-viewport" id="slot-vp-${tierId}">
      <div class="slot-highlight"></div>
      <div class="slot-reel"></div>
    </div>
    <div class="slot-result slot-result--empty" id="slot-result-${tierId}">—</div>
  </div>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────
let players     = [];
let assignments = [];

async function loadState() {
  players     = await DB.getPlayers();
  assignments = await DB.getAssignments();
}

function getAssigned(tier) {
  return assignments.filter(a => a.tier === tier).map(a => a.team_id);
}
function getRemaining(tier) {
  const used = new Set(getAssigned(tier));
  return getTierTeams(tier).filter(t => !used.has(t.id));
}

function playBeep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
  } catch (_) {}
}

function showResult(msg) {
  const el = document.getElementById('result-banner');
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2800);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── PLAYER MODE ─────────────────────────────────────────────────────
async function initPlayerMode(playerId) {
  document.getElementById('player-mode').style.display = 'block';
  document.getElementById('page-title').textContent = 'YOUR DRAW';

  await loadState();

  const player = players.find(p => p.id === playerId);
  if (!player) {
    showStatusMsg('Invalid draw link. Ask the admin for your link.', 'error');
    return;
  }

  document.getElementById('greeting-name').textContent = `${player.name.toUpperCase()}, IT'S YOUR TURN!`;

  // Check existing assignments
  const myAssignments = assignments.filter(a => a.player_id === playerId);
  const drawnTiers    = new Set(myAssignments.map(a => a.tier));

  if (drawnTiers.size === 3) {
    showPlayerReveal(playerId, myAssignments);
    return;
  }

  // Build 3 slot machines
  const machine = document.getElementById('slot-machine');
  machine.innerHTML = [1, 2, 3].map(makeSlotHTML).join('');

  const slots = [1, 2, 3].map(tier => new SlotMachine(document.getElementById(`slot-vp-${tier}`)));

  // Set idle state for each reel (all teams for that tier — player doesn't see what's taken)
  [1, 2, 3].forEach(tier => slots[tier - 1].setIdleTeams(getTierTeams(tier)));

  // Restore already-drawn tiers
  myAssignments.forEach(a => {
    const team = getTeam(a.team_id);
    const resultEl = document.getElementById(`slot-result-${a.tier}`);
    resultEl.textContent = `${team.flag} ${team.name}`;
    resultEl.className   = 'slot-result slot-result--done';
  });

  // Figure out which tier to draw next
  let nextTier = [1, 2, 3].find(t => !drawnTiers.has(t));

  const spinBtn = document.getElementById('player-spin-btn');
  spinBtn.disabled = false;

  spinBtn.addEventListener('click', async () => {
    if (!nextTier) return;
    spinBtn.disabled = true;

    const remaining = getRemaining(nextTier);
    if (!remaining.length) { showStatusMsg('No teams left in this tier!', 'error'); return; }

    // Pick target before animating
    const target = remaining[Math.floor(Math.random() * remaining.length)];
    await DB.saveAssignment(playerId, target.id, nextTier);
    assignments.push({ player_id: playerId, team_id: target.id, tier: nextTier });

    // Spin — show all teams for this tier (player doesn't know what's taken)
    const allTierTeams = getTierTeams(nextTier);
    await slots[nextTier - 1].spin(allTierTeams, target);
    playBeep();

    const resultEl = document.getElementById(`slot-result-${nextTier}`);
    resultEl.textContent = `${target.flag} ${target.name}`;
    resultEl.className   = 'slot-result slot-result--done';

    drawnTiers.add(nextTier);
    nextTier = [1, 2, 3].find(t => !drawnTiers.has(t));

    if (!nextTier) {
      await DB.setSetting('draw_complete', 'true');
      await sleep(600);
      showPlayerReveal(playerId, assignments.filter(a => a.player_id === playerId));
    } else {
      spinBtn.disabled = false;
    }
  });
}

function showPlayerReveal(playerId, myAssignments) {
  document.getElementById('slot-machine').style.display = 'none';
  document.getElementById('player-spin-btn').style.display = 'none';
  document.getElementById('greeting-sub').textContent = 'Your teams have been drawn!';
  document.getElementById('reveal-card').style.display = 'block';

  const teamsHTML = [1, 2, 3].map(tier => {
    const a    = myAssignments.find(a => a.tier === tier);
    if (!a) return '';
    const team = getTeam(a.team_id);
    const labels = { 1: 'TIER 1 — STRONG', 2: 'TIER 2 — MID', 3: 'TIER 3 — UNDERDOG' };
    return `<div class="reveal-team reveal-team--t${tier}">
      <span class="tier-name">${labels[tier]}</span>
      <span style="font-size:2rem">${team.flag}</span>
      <div style="margin-top:6px;font-family:var(--font-pixel);font-size:8px">${team.name.toUpperCase()}</div>
    </div>`;
  }).join('');

  document.getElementById('reveal-teams').innerHTML = teamsHTML;
}

// ─── ADMIN / SPECTATOR MODE ──────────────────────────────────────────
let adminAuthed      = false;
let adminSlots       = [];
let adminCurrentStep = 0;
let adminDrawOrder   = [];

async function initAdminMode() {
  document.getElementById('admin-mode').style.display = 'block';
  await loadState();
  buildAdminDrawOrder();
  buildAdminSlots();
  renderAdminProgress();
  renderAdminLog();
  updateAdminSpinBtn();

  document.getElementById('admin-auth-btn').addEventListener('click', checkAdminAuth);
  document.getElementById('admin-pwd-input').addEventListener('keydown', e => { if (e.key === 'Enter') checkAdminAuth(); });
  document.getElementById('spin-btn').addEventListener('click', doAdminSpin);
  document.getElementById('share-draw-btn').addEventListener('click', shareDrawLink);
}

function buildAdminDrawOrder() {
  const assigned = new Set(assignments.map(a => `${a.player_id}_${a.tier}`));
  adminDrawOrder = [];
  players.forEach(player => {
    [1, 2, 3].forEach(tier => {
      if (!assigned.has(`${player.id}_${tier}`)) adminDrawOrder.push({ player, tier });
    });
  });
  adminCurrentStep = 0;
}

function buildAdminSlots() {
  const machine = document.getElementById('admin-slot-machine');
  machine.innerHTML = makeSlotHTML(1);
  adminSlots = [new SlotMachine(document.getElementById('slot-vp-1'))];
  if (adminDrawOrder.length) {
    adminSlots[0].setIdleTeams(getRemaining(adminDrawOrder[0].tier));
  }
}

function renderAdminProgress() {
  const total = players.length * 3;
  const done  = assignments.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = `${done} / ${total} TEAMS ASSIGNED`;

  if (adminCurrentStep < adminDrawOrder.length) {
    const { player, tier } = adminDrawOrder[adminCurrentStep];
    document.getElementById('current-player').textContent = player.name.toUpperCase();
    document.getElementById('current-tier').textContent   = `TIER ${tier} — ${['','STRONG','MID','UNDERDOG'][tier]}`;
    document.getElementById('current-tier').className     = `slot-label slot-label--t${tier}`;
    document.getElementById('current-info').style.display = 'block';
  } else {
    document.getElementById('current-info').style.display = 'none';
  }
}

function renderAdminLog() {
  const log = document.getElementById('draw-log');
  if (!players.length) { log.innerHTML = '<p class="muted">No players yet.</p>'; return; }

  const byPlayer = {};
  players.forEach(p => { byPlayer[p.id] = { name: p.name, teams: {} }; });
  assignments.forEach(a => { if (byPlayer[a.player_id]) byPlayer[a.player_id].teams[a.tier] = getTeam(a.team_id); });

  log.innerHTML = players.map(p => {
    const d = byPlayer[p.id];
    const chips = [1,2,3].map(tier => {
      const t = d.teams[tier];
      if (!t) return `<span class="chip chip--empty">T${tier}:?</span>`;
      return `<span class="chip chip--t${tier}">${t.flag} ${t.tla}</span>`;
    }).join('');
    const done = [1,2,3].every(t => d.teams[t]);
    return `<div class="log-row ${done ? 'log-row--done' : ''}">
      <strong>${p.name.toUpperCase()}</strong>
      <div class="chips">${chips}</div>
    </div>`;
  }).join('');
}

function updateAdminSpinBtn() {
  const btn     = document.getElementById('spin-btn');
  const authRow = document.getElementById('auth-row');
  const coinMsg = document.getElementById('insert-coin-msg');
  if (!adminAuthed) {
    authRow.style.display = 'flex';
    btn.style.display     = 'none';
    if (coinMsg) coinMsg.style.display = 'block';
    return;
  }
  authRow.style.display = 'none';
  if (coinMsg) coinMsg.style.display = 'none';
  btn.style.display = 'block';
  btn.disabled = adminCurrentStep >= adminDrawOrder.length;
  btn.textContent = adminCurrentStep >= adminDrawOrder.length ? 'DRAW COMPLETE' : 'SPIN!';
}

async function doAdminSpin() {
  if (adminCurrentStep >= adminDrawOrder.length) return;
  const { player, tier } = adminDrawOrder[adminCurrentStep];
  const remaining = getRemaining(tier);
  if (!remaining.length) return;

  const target = remaining[Math.floor(Math.random() * remaining.length)];
  await DB.saveAssignment(player.id, target.id, tier);
  assignments.push({ player_id: player.id, team_id: target.id, tier, players: { name: player.name } });

  document.getElementById('spin-btn').disabled = true;
  await adminSlots[0].spin(getTierTeams(tier), target);
  playBeep();
  showResult(`${player.name.toUpperCase()} → ${target.flag} ${target.name.toUpperCase()}`);

  adminCurrentStep++;

  await sleep(1800);

  if (adminCurrentStep < adminDrawOrder.length) {
    const next = adminDrawOrder[adminCurrentStep];
    adminSlots[0].setIdleTeams(getRemaining(next.tier));
  } else {
    await DB.setSetting('draw_complete', 'true');
  }

  renderAdminProgress();
  renderAdminLog();
  updateAdminSpinBtn();
}

function checkAdminAuth() {
  const input = document.getElementById('admin-pwd-input');
  if (input.value === CONFIG.ADMIN_PASSWORD) {
    adminAuthed = true;
    updateAdminSpinBtn();
  } else {
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 400);
    input.value = '';
  }
}

function shareDrawLink() {
  const base = window.location.href.split('?')[0];
  const msg  = encodeURIComponent(`⚽ WC2026 Draw — watch live!\n${base}`);
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}

function showStatusMsg(msg, type = 'info') {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className   = `status-msg status-msg--${type}`;
  el.style.display = 'block';
}

// ─── Entry point ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const params   = new URLSearchParams(location.search);
  const token    = params.get('token');
  const playerId = validateToken(token);

  if (playerId) {
    await initPlayerMode(playerId);
  } else {
    await initAdminMode();
  }
});
